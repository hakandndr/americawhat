# americawhat — staging

Staging mirrors production with its own Workers, D1 databases, Access
application and content repository; nothing in it can reach production.
Preferred release path: "Deploy to Cloudflare" with target `staging`
([DEPLOYMENT.md](DEPLOYMENT.md)). Below is the manual frozen-package path,
used when CI is not suitable (it was used for every staging release so far).

## Fixed staging settings

| Item | Value |
|---|---|
| Web | `americawhat-web-staging`, https://americawhat-web-staging.hakan-c89.workers.dev (`noindex`; page views stored only with the `STAGING_TEST_KEY` header) |
| Boss | `americawhat-boss-staging`, https://americawhat-boss-staging.hakan-c89.workers.dev behind Access app `dndr-staging-owner-only` (AUD `f750490d…8b194b`, `hakan@dndr.net` only) |
| D1 | `americawhat-app-staging` `a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2`, `americawhat-analytics-staging` `306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c` |
| Editorial target | `hakandndr/americawhat-staging-content` / `content-staging` (enforced in code; a staging Boss cannot write `main`) |
| Secrets (names) | Web `REACTION_GUARD_SECRET`, `STAGING_TEST_KEY`; Boss `BOSS_CSRF_SECRET`, `GITHUB_TOKEN` (sandbox-only PAT, expires 2026-11-14) |

Staging data is test data; never copy it to production.

## Manual release (frozen package)

Clean HEAD, wrangler with owner OAuth (`CLOUDFLARE_API_TOKEN` unset):

```bash
python -m pip install --only-binary=:all: --require-hashes -r scripts/og/requirements.txt
python scripts/gen-og.py --missing
npm run build:rc
npm run verify:static
node scripts/release/package-candidate.mjs <name>
node scripts/release/verify-staging-candidate.mjs reports/<name>-release-manifest.json <seal printed by the previous command>
```

Upload (no traffic yet), then record the two version UUIDs and the versions
serving now (rollback targets) from `npx wrangler deployments status --config workers/web/wrangler.jsonc --env ""`:

```bash
node node_modules/wrangler/bin/wrangler.js versions upload reports/<name>-candidate/web/index.js --no-bundle --env "" --config reports/<name>-candidate/config/web.jsonc --name americawhat-web-staging --assets reports/<name>-candidate/dist --var RELEASE_ID:<full sha> --tag <short sha> --upload-source-maps=false
```

```bash
node node_modules/wrangler/bin/wrangler.js versions upload reports/<name>-candidate/boss/index.js --no-bundle --env "" --config reports/<name>-candidate/config/boss.jsonc --name americawhat-boss-staging --var RELEASE_ID:<full sha> --tag <short sha> --upload-source-maps=false
```

Activate Web first, check, then Boss:

```bash
node node_modules/wrangler/bin/wrangler.js versions deploy "<web uuid>@100%" --env "" --config reports/<name>-candidate/config/web.jsonc --name americawhat-web-staging --yes
```

```bash
node node_modules/wrangler/bin/wrangler.js versions deploy "<boss uuid>@100%" --env "" --config reports/<name>-candidate/config/boss.jsonc --name americawhat-boss-staging --yes
```

Checks: `/api/health` (release = full SHA, `schema_app`/`schema_analytics` ok),
`node scripts/release/cf-release.mjs schema-gate https://americawhat-web-staging.hakan-c89.workers.dev`,
`npm run smoke -- https://americawhat-web-staging.hakan-c89.workers.dev`, anonymous
Boss paths → 302 to the dndrnet Access login, staging row counts unchanged.
Rollback: the same `versions deploy` with the recorded previous UUID.

The release record of the last manual staging release (P10b) is
[archive/staging/STAGING-SCHEMA-RELEASE.md](archive/staging/STAGING-SCHEMA-RELEASE.md).
