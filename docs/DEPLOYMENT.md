# americawhat — deployment (GitHub Actions → Cloudflare)

How code and content reach production and staging, and how to undo it.

## Workflows

| File | Trigger | Does |
|---|---|---|
| `ci.yml` | push to any branch except `main`, pull requests, manual | Tests, OG attestation, release build, static checks, dry-run bundles for staging and production. No secrets, no deploy. |
| `deploy-cloudflare.yml` | push to `main` touching application/content, workflows or tests; manual (target + confirm) | Builds/tests once. Verified Boss content deploys Web only through `production-content`; everything else uses the reviewed `production` (or manual `staging`) Environment. Smoke tests and automatic rollback follow activation. |
| `rollback-cloudflare.yml` | manual | Serves one recorded version of one Worker at 100 %. |
| `fetch.yml` | `0 2,14,20 * * *` UTC, manual | Commits `pending.json`, `seen_ids.json`, `fetch-status.json` to `main` (retry-safe; does not trigger a deploy). |
| `deploy.yml` | manual only | Retired Hostinger FTP deploy; refuses to run. Hostinger republish uses tag `hostinger-final` ([POST-CUTOVER.md](POST-CUTOVER.md)). |

Documentation-only changes (`docs/**`, `*.md`) never trigger a deploy.

## Production gates (all required)

1. Run on `refs/heads/main` (pull requests and other branches never deploy).
2. Repository variable `CF_PRODUCTION_DEPLOY_ENABLED` = `true` (set 2026-10-16;
   unset it to stop all production deploys at once).
3. A manual run repeats the target name in `confirm`.
4. `node scripts/release/cf-release.mjs check-config production` passes (real
   production D1 ids, production Access AUD, Boss → `hakandndr/americawhat` /
   `main`, owner-only e-mail, the three custom domains, workers.dev and preview
   URLs off, explicit CPU limits).
5. GitHub Environment `production`: required reviewer `hakandndr`, branch
   `main`, admin bypass off, `prevent_self_review` off (single owner — enabling it
   would make every deploy unapprovable). Holds the production
   `CLOUDFLARE_API_TOKEN` (per-Worker **Editor** on the two production Workers
   only; no D1, DNS, Routes or Access permission) and `CLOUDFLARE_ACCOUNT_ID`.

`node scripts/release/cf-release.mjs simulate` shows the decision for every
trigger combination.

## What a deploy does

`plan` → `build` (no secrets: pinned Pillow, `npm ci`, check-config, tests,
`gen-og.py --verify-approved`, `gen-og.py --missing`, `build:rc`,
`verify:static`, dry-run bundles, artifact) → `deploy` (Environment approval):

1. Re-hash the downloaded `dist/` against the build manifest.
2. **Schema gate** (`cf-release.mjs schema-gate "$WEB_URL"`): the serving Web
   Worker publishes SHA-256 digests of the applied D1 migrations on
   `/api/health`; they must equal this release's `migrations/`. A pending,
   extra or unreadable migration stops the job before upload. Migrations are
   applied by hand by the owner (OAuth `wrangler d1 migrations apply … --remote
   --env production`), never by CI.
3. Record the versions serving now (rollback targets).
4. `versions upload <frozen bundle> --no-bundle` for Web and Boss (tag = short
   SHA, `RELEASE_ID` = full SHA; secrets inherited).
5. Serve Web, read-only smoke test, serve Boss, anonymous Boss → Access 302.
6. Any failure after activation rolls both Workers back. The job summary lists
   previous and new version ids.

CI never runs `wrangler deploy` (routes/custom domains), `secret put`,
`d1 migrations apply` or `d1 execute`.

Content flow after the one-time setup below: Boss approval → one signed commit
to `main` → eligibility check → tests, pinned OG generation, build and static
checks → `production-content` → Web upload/activation → expected-release smoke
test. A failed or uncertain activation restores the previous Web version.
GitHub content/audit records remain intact for recovery; rollback does not undo
editorial decisions or D1 data. Boss itself is never deployed by this path.

## Automatic Boss content: eligibility and one-time setup

**Not enabled by this PR.** Keep the existing `production` reviewer, main-only
branch policy, admin-bypass setting and credentials unchanged. The redesign's
first production deployment must be owner-approved.

`scripts/release/content-eligibility.mjs` requires all of the following:

- An enabled push to `hakandndr/americawhat` / `main`, exactly one Boss
  transaction in the push (the event's `before` must be its single parent).
- Healthy production `/api/health` with a full release SHA that exists in this
  checkout's complete Git history. Every commit from that live SHA to the
  candidate is checked, not just the last diff. Merges, empty commits, missing
  history and more than 1,000 commits fail closed.
- Only modifications of existing regular `100644` content files: Boss may
  modify `src/data/published.json` and `src/data/pending.json`. Intermediate
  fetch commits may modify only `pending.json`, `seen_ids.json` and
  `fetch-status.json`. No additions, deletions, renames, symlinks or executable
  files. Every commit touching published content must carry a valid Boss
  Ed25519 proof; the head must change published content.
- The proof binds the repository, branch, parent SHA, entire tree SHA and
  editorial commit message. A matching author or `content:` message alone
  proves nothing. The private key exists only in production Boss, after its
  existing Access, owner, CSRF and transaction validation.

Any application, workflow, configuration, infrastructure, schema, security or
other non-allowlisted change since the live version selects `production` and
its owner approval. Even a code change followed by a revert is rejected. A
docs-only commit can therefore require a manual reviewed production deployment
before subsequent content can use automation. Unsigned pre-setup content also
needs that reviewed baseline. Missing setup/evidence selects review, never an
unprotected fallback. Both paths share one production concurrency group.

Owner setup, once:

1. In GitHub **this repository → Settings → Environments**, create
   `production-content`, no required reviewer, selected deployment branch
   **main only**. Add Environment secrets `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN`. Create a separate token with **Editor on only
   `americawhat-web-production`**, with an expiry. No product/account-wide
   Workers role; no Boss, D1, DNS, Routes or Access permissions. Do not copy the
   two-Worker production token. Cloudflare supports this scope for version
   upload/deploy ([roles documentation](https://developers.cloudflare.com/workers/authorization/workers/)).
2. Generate an Ed25519 key pair locally. Store PKCS8 DER private key encoded
   as base64 in the owner's vault, and SPKI DER public key encoded as base64.
   Example below writes only local ignored files and refuses overwriting:

   ```powershell
   node --input-type=module -e 'import fs from "node:fs"; import {generateKeyPairSync} from "node:crypto"; const k=generateKeyPairSync("ed25519"); fs.mkdirSync(".wrangler/content-signing",{recursive:true}); for(const [name,type,key] of [["private","pkcs8",k.privateKey],["public","spki",k.publicKey]]) fs.writeFileSync(".wrangler/content-signing/"+name+".base64",key.export({type,format:"der"}).toString("base64"),{flag:"wx",mode:0o600});'
   ```

   The private file is secret material: import it into the vault and remove the
   local copy after provisioning. Never paste it into GitHub, an issue or logs.
3. On Cloudflare **only `americawhat-boss-production` → Settings → Variables
   and Secrets**, add secret `BOSS_CONTENT_SIGNING_KEY` = private base64 value.
   This is an owner-controlled production secret rollout; save/deploy it as
   part of the initial approved rollout. Do not set it on staging or Web.
   In GitHub repository **Variables**, set `BOSS_CONTENT_PUBLIC_KEY` = public
   base64 value (public, not a secret). CI never receives the private key.
4. Merge the green PR and approve the normal `production` deployment. Confirm
   Web health reports that reviewed SHA and Boss remains behind Access. Then
   set repository variable `CF_CONTENT_DEPLOY_ENABLED=true`. Existing
   `CF_PRODUCTION_DEPLOY_ENABLED=true` remains required for both paths.
5. Approve a real story in Boss. Verify `plan` says automatic content,
   `build` is green, `content_deploy` succeeds without a GitHub approval,
   `deploy` is skipped, and the new article and OG image are live. A code PR
   must instead skip `content_deploy` and wait in `production`. This live
   acceptance requires the setup and owner-approved initial release; unit and
   real-Git integration tests cover both routing decisions before deployment.

The deploy job rechecks the live baseline, signatures and current main before
any step receives Cloudflare credentials; a superseded run aborts. A later
fetch may supersede a run too: retry via the reviewed manual workflow if no
new Boss publication follows. Post-plan evidence changes abort the content
job instead of silently switching environments. Actions logs/summary retain
the source SHA and previous/new Web version IDs.

If a content deployment fails, keep the failure visible, fix the cause and use
the reviewed manual production workflow to retry the committed content. Disable
`CF_CONTENT_DEPLOY_ENABLED` to return all news to owner review; disable
`CF_PRODUCTION_DEPLOY_ENABLED` to stop both paths. Rotate the proof key with
content automation disabled and establish a new reviewed production baseline
before re-enabling it. Protect `main` and review workflow changes: a per-Worker
Editor token can deploy code on that Worker, so the workflow and GitHub write
access are part of the trust boundary; the file/proof gates enforce its
intended content-only use.

## Staging

Run "Deploy to Cloudflare" manually with target `staging` (Environment
`staging`: same reviewer, branches `main`, `backup/*`, `codex/*`, its own
per-Worker staging token). The manual frozen-package procedure remains in
[STAGING-DEPLOYMENT.md](STAGING-DEPLOYMENT.md).

## Rollback

- Code: "Roll back Cloudflare Worker" (target, worker, version UUID from
  [CURRENT-STATE.md](CURRENT-STATE.md), confirm `production/web` etc.), or
  locally with owner OAuth:
  `npx wrangler versions deploy <uuid>@100% --yes --env production --config workers/web/wrangler.jsonc`.
- Data (D1): forward fixes; Time Travel only as a last resort (it rewinds ALL #).
- Whole site to Hostinger: [POST-CUTOVER.md](POST-CUTOVER.md#rollback-to-hostinger).

## Credentials

Production and staging tokens, the Boss GitHub PAT and Worker secrets are
listed (names only) with rotation steps in
[PRODUCTION-PROVISIONING.md](PRODUCTION-PROVISIONING.md). Store a new token
without echoing it: `gh secret set CLOUDFLARE_API_TOKEN --env production --repo hakandndr/americawhat`.
