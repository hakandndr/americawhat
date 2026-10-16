# americawhat — Deployment (GitHub Actions → Cloudflare)

Authoritative for how code reaches staging and production after the
Cloudflare cutover. Prepared 2026-10-15 on `codex/staging-rc`; **not on
`main` yet, and nothing in it has run on GitHub.** Production resources do
not exist yet (see [PRODUCTION-PROVISIONING.md](PRODUCTION-PROVISIONING.md)).

## Workflows

| File | Trigger | What it can do |
|---|---|---|
| `ci.yml` | push to any branch except `main`, pull requests, manual | Tests, OG attestation, release build, static checks, dry-run bundles for staging **and** production configs. No secret, no deploy. |
| `deploy-cloudflare.yml` | push to `main` touching site/Worker files; manual | Builds once, then (in a GitHub Environment) uploads new Worker versions, serves them at 100 %, smoke-tests, auto-rolls back on failure. |
| `rollback-cloudflare.yml` | manual only | Serves one recorded version of one Worker at 100 %. |
| `fetch.yml` | schedule `0 2,14,20 * * *` (UTC), manual | Unchanged behaviour: commits `pending.json`, `seen_ids.json`, `fetch-status.json` to `main`. Retry-safe push (this branch's version). |
| `deploy.yml` | manual only | **Retired.** No FTP step, no FTP secret; it fails on purpose. Kept so the workflow name stays and a push to `main` can never reach Hostinger again. |

Scheduled workflows run only from the default branch, so until the merge the
`main` versions of `fetch.yml` and `deploy.yml` stay in force: **merging this
branch is the moment Hostinger FTP publishing stops.** That is why the merge
belongs inside the cutover window ([PRODUCTION-MIGRATION-PLAN.md](PRODUCTION-MIGRATION-PLAN.md)).

## Production gates (all required)

1. The run is on `refs/heads/main`. Pull requests and other branches never deploy.
2. Repository **variable** `CF_PRODUCTION_DEPLOY_ENABLED` = `true`. Unset today;
   the owner sets it during cutover, **only after the custom domains are
   attached** (the smoke test checks `https://americawhat.com`; before the
   domains move it would test Hostinger and roll back). Without it a push to
   `main` builds nothing and logs a notice.
3. A manual run repeats the target name in `confirm`.
4. `node scripts/release/cf-release.mjs check-config production` passes: both
   Wrangler configs have real production D1 ids (not `PRODUCTION_NOT_PROVISIONED`,
   not the staging ids), a 64-hex Access AUD that is not the staging one, Boss
   targeting `hakandndr/americawhat` / `main`, owner-only email, the three custom
   domains, `workers_dev`/`preview_urls` off and explicit `limits.cpu_ms`.
5. GitHub Environment **`production`**: required reviewer `hakandndr`,
   deployment branches = `main` only, and the only place the production
   `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` exist.

Simulate every trigger combination locally (reads configs only):

```bash
node scripts/release/cf-release.mjs simulate
```

## What a deploy does

`plan` (decides target) → `build` (no secrets: pinned Pillow, `npm ci`,
`check-config`, `npm test`, `gen-og.py --verify-approved`, `gen-og.py --missing`,
`npm run build:rc`, `verify:static`, `wrangler deploy --dry-run --outdir`
bundles, artifact) → `deploy` (Environment; secrets only here):

1. `verify-dist` re-hashes the downloaded `dist/` against the build manifest.
2. `d1 migrations list --remote` for both databases must say "No migrations to
   apply"; a schema change is applied by hand first (never by CI).
3. `deployments status --json` records the versions serving now (rollback targets).
4. `versions upload <frozen bundle> --no-bundle` for Web and Boss (tag = short
   SHA, `RELEASE_ID` = full SHA). Secrets are inherited from the current version.
5. `versions deploy <web>@100%`, read-only smoke test (`scripts/release/smoke.mjs`),
   `versions deploy <boss>@100%`, anonymous Boss request must be a 302 to
   `*.cloudflareaccess.com`.
6. On any failure after activation, both Workers go back to the recorded versions.
7. The job summary lists previous and new version ids.

CI never runs `wrangler deploy` (which would apply routes/custom domains),
`secret put`, `d1 migrations apply` or `d1 execute`.

Content flow after cutover: Boss approves → one commit to `main`
(`published.json` + `pending.json`) → this workflow → reviewer approves the
`production` deployment → live. Fetch commits do not trigger it (path filter).
If the owner later wants content commits live without a click, remove the
required reviewer from the Environment; every other gate stays.

## GitHub setup (owner, at provisioning time — not done)

| Item | Value |
|---|---|
| Environment `staging` | secrets `CLOUDFLARE_API_TOKEN` (staging token), `CLOUDFLARE_ACCOUNT_ID`; branches: any |
| Environment `production` | required reviewer `hakandndr`; branch policy `main`; secrets `CLOUDFLARE_API_TOKEN` (production token), `CLOUDFLARE_ACCOUNT_ID` |
| Repository variable | `CF_PRODUCTION_DEPLOY_ENABLED` — leave unset until cutover step "enable CI deploys" |
| Repository secrets `FTP_SERVER`/`FTP_USERNAME`/`FTP_PASSWORD` | keep until the Hostinger rollback window ends (they are used only by the `hostinger-final` tag), then delete |

Tokens (account-owned API tokens, one per environment, never shared):

- **production**: Workers **Editor** scoped to the two Workers
  `americawhat-web-production` and `americawhat-boss-production` (they must
  exist first; per-Worker roles cannot target a Worker that does not exist),
  plus **D1 Read** (for `migrations list`). No zone, DNS, Access or Routes
  permission: CI never changes routes or custom domains.
- **staging**: the same shape scoped to the two staging Workers. The staging
  token must not be able to touch production Workers and vice versa.

## Rollback

- **Worker code (seconds):** "Roll back Cloudflare Worker" workflow, inputs
  `target`, `worker`, `version_id` (from the release summary) and
  `confirm` = `production/web` etc. Locally with owner OAuth:
  `npx wrangler versions deploy <uuid>@100% --yes --config workers/web/wrangler.jsonc --env production`.
- D1 data, secrets, routes: not touched by a code rollback.
- **Hostinger rollback** (whole site back to Hostinger): see
  [PRODUCTION-MIGRATION-PLAN.md](PRODUCTION-MIGRATION-PLAN.md#rollback). Before the
  merge, the owner tags the last Hostinger-compatible `main` commit as
  `hostinger-final`; a Hostinger republish is then "Deploy to Hostinger" run on
  that tag (the tag carries the original FTP workflow).

## Staging deploys

Manual: Actions → "Deploy to Cloudflare" → target `staging`, confirm
`staging`, any branch. Until the `staging` Environment and its token exist the
documented local procedure ([STAGING-DESIGN-ROLLOUT.md](STAGING-DESIGN-ROLLOUT.md))
remains the way to release staging.

## Verified locally (2026-10-15)

- `npm test` 182/182 including the workflow structure tests
  (`tests/deploy-workflows.test.mjs`), the OG pipeline and reconciliation tests.
- `cf-release.mjs simulate`: only `main` + variable + confirmation deploys
  production, and today it then fails at `check-config` (not provisioned).
- `wrangler deploy --dry-run` for staging and `--env production`, and the exact
  `versions upload <bundle> --no-bundle ... --dry-run` commands, show the
  production D1 names, vars, assets and `RELEASE_ID`.
- Release build of `ef24272` equals the staged 209aa9e static package except
  `rss.xml` (commit-time `lastBuildDate`).
- Not verifiable locally: GitHub-side Environment rules, the real API calls,
  `actionlint` (not installed; YAML is parsed and checked by tests instead).
