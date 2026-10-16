# americawhat staging — schema-aware release (P10b, 2026-10-16)

Staging only, under the owner's authorization for P10b. Production Workers,
production D1, DNS, Hostinger, `main` and other projects were not changed.

## Release

| Item | Value |
|---|---|
| Source | `ae09988c1d8eb6b97c69951038a0e89fc0b8318f` (= `RELEASE_ID`) |
| Package | `reports/schema-candidate`, manifest `reports/schema-release-manifest.json`, 321 files, seal `3bbbd45e6e2ae018206de5dc28b2caf9f70ec4d67168dc5de7a438fee20cc896` (built with `scripts/release/package-candidate.mjs`; `verify-staging-candidate.mjs` PASS, 0 remote writes) |
| Web `americawhat-web-staging` | **754be640-dde9-43bb-8247-e672404a6858** at 100 % (tag `ae09988c1d8e`) |
| Boss `americawhat-boss-staging` | **17aa89e2-9ff9-45f5-a2d5-358974fcc1a5** at 100 % (tag `ae09988c1d8e`) |
| Rollback targets | Web `1346af78-327b-434d-8cd1-294d0bf39dc3` (c08cdfc), Boss `855652dd-d155-42db-a719-9c363256ab42` (209aa9e) |

Procedure: [STAGING-DEPLOYMENT.md](STAGING-DEPLOYMENT-2026-10-15.md) — clean HEAD →
`build:rc` (124 approved OG images, none generated) → `verify:static` →
frozen package → verify → `versions upload --no-bundle` (secrets inherited;
names checked: Web `REACTION_GUARD_SECRET`, `STAGING_TEST_KEY`; Boss
`BOSS_CSRF_SECRET`, `GITHUB_TOKEN`; bindings = staging D1 `a3c9ff1f…`,
`306b9ee6…`) → Web `versions deploy` → checks → Boss `versions deploy`.
Only `rss.xml` changed among the static assets.

Rollback (same syntax, old UUID):
`node node_modules/wrangler/bin/wrangler.js versions deploy "1346af78-327b-434d-8cd1-294d0bf39dc3@100%" --env "" --config reports/schema-candidate/config/web.jsonc --name americawhat-web-staging --yes`
(and `855652dd-…@100%` with `boss.jsonc` / `americawhat-boss-staging`).

## Verification

- `/api/health`: `status: ok`, `release: ae09988c…`, checks `app_db`,
  `analytics_db`, `reaction_secret`, **`schema_app`, `schema_analytics` = ok**;
  `schema.app` = `09463a4bbe9bd3d78008019b31db6c8722f2d3dff0a8a7e1d0315ef3e4e3e5eb`,
  `schema.analytics` = `dde90fffb191e5925ef5a1c480ec1dac1b214e454be9cc3921735fff68d0c020`
  — identical to the digests of `migrations/` computed locally.
- `node scripts/release/cf-release.mjs schema-gate https://americawhat-web-staging.hakan-c89.workers.dev`
  → `ok: true` against the real staging Worker (it failed closed before the release).
- `npm run smoke -- https://americawhat-web-staging.hakan-c89.workers.dev`
  (read-only mode): 21/21 PASS; `X-Robots-Tag: noindex, nofollow` kept.
- Boss anonymous: `/`, `/analytics`, `/published`, `/reactions`, `/audit`,
  `/health`, `/assets/analytics.js`, a forged email header with a fake
  assertion, and an anonymous POST all answer **302 to the dndrnet Access
  login**.
- **Not verified here:** owner-authenticated Boss access (needs the owner's
  Access login; the assistant does not sign in as the owner). Owner check:
  open the staging Boss, confirm Weekly review, Analytics, Published,
  Reactions, Audit and Health load; Health shows the new release.
- Staging data unchanged (before → after): reaction rows 10 → 10, votes 11 → 11,
  editorial decisions 0 → 0, reaction imports 0 → 0, visitor events 13 → 13
  (max id 22 → 22), import corpora 1 → 1, DNDR outbox 0 → 0.
- Settings unchanged: staging workers.dev on / previews off / no custom domain;
  production Workers still `7dfff6ea…` (Web) and `14998af5…` (Boss), workers.dev
  and previews off, no custom domain.

## Restricted CI tokens — not exercised

The per-Worker Editor tokens in the GitHub Environments have **not** been
used by anything yet; nothing here validates them. Why they cannot be tested
from CI now: `deploy-cloudflare.yml` and `rollback-cloudflare.yml` can be
dispatched only once they are on the default branch, and the `production`
Environment admits only `main`. Adding a temporary secret-reading workflow to
the backup branch would change what that branch's pushes do, so it was not
done.

Safe, read-only owner test (local PowerShell; the token is typed into the
prompt, never printed or saved; no production change):

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = 'c8999b29b2123e2f9634248c58f43f14'
$env:CLOUDFLARE_API_TOKEN = Read-Host 'staging token' -MaskInput
npx wrangler deployments status --config workers/web/wrangler.jsonc --env ""     # expect: 754be640… 100 %
npx wrangler deployments status --config workers/boss/wrangler.jsonc --env ""    # expect: 17aa89e2… 100 %
npx wrangler deployments status --config workers/web/wrangler.jsonc --env production   # expect: refused (not its Worker)
npx wrangler d1 list                                                                    # expect: refused (no D1 permission)
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Repeat with the production token (expect the production Workers readable,
staging refused, D1 refused). `deployments status` reads only; it proves
scope, not write access. Write access (version upload/deploy) is first
exercised by the real workflow after the merge, on staging first.
