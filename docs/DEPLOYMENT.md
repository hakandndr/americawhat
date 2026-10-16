# americawhat — deployment (GitHub Actions → Cloudflare)

How code and content reach production and staging, and how to undo it.

## Workflows

| File | Trigger | Does |
|---|---|---|
| `ci.yml` | push to any branch except `main`, pull requests, manual | Tests, OG attestation, release build, static checks, dry-run bundles for staging and production. No secrets, no deploy. |
| `deploy-cloudflare.yml` | push to `main` touching `src/` (except the three fetch files), `public/`, `workers/`, `migrations/`, `scripts/`, `astro.config.mjs`, `package*.json`; manual (target + confirm) | Builds once, then in the target's GitHub Environment uploads new Worker versions, serves them at 100 %, smoke-tests, rolls back automatically on failure. |
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

Content flow: Boss approval → one commit to `main` → this workflow → the owner
approves the `production` deployment in GitHub → live.

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
