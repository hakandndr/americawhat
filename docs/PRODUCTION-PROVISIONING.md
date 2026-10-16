# americawhat — production resources and credentials

What exists in production, the commands that configure it, and how to rotate
credentials. Values of secrets never go into chat, commits or logs. Run
wrangler with the owner's OAuth login (`CLOUDFLARE_API_TOKEN` unset). The
original provisioning log is
[archive/migration/PRODUCTION-PROVISIONING-2026-10-16.md](archive/migration/PRODUCTION-PROVISIONING-2026-10-16.md).

## Account

Cloudflare account `c8999b29b2123e2f9634248c58f43f14` (Workers Paid and R2
Paid active). Production configs set CPU ceilings: Web `limits.cpu_ms` 1000,
Boss 10000. The Web Worker runs first on every request (`run_worker_first`),
so page requests are billed Worker requests; current traffic is far inside the
included 10 M requests / 30 M CPU-ms per month. D1 is billed separately.

## Resources

| Resource | Identifier / setting |
|---|---|
| Worker `americawhat-web-production` | custom domains `americawhat.com`, `www.americawhat.com`; workers.dev and preview URLs off |
| Worker `americawhat-boss-production` | custom domain `boss.americawhat.com`; workers.dev and preview URLs off |
| D1 `americawhat-app-production` | `3097933b-4feb-4e50-bb59-760fd06a640e` (reactions, guards, editorial decisions, Boss audit) |
| D1 `americawhat-analytics-production` | `1012183d-96cd-4d7f-8e93-ca247ca43589` (page views, import ledger, retention aggregates) |
| Access application | "AmericaWhat Boss Production", `boss.americawhat.com`, team `dndrnet.cloudflareaccess.com`, allow `hakan@dndr.net` only; AUD `6b54c07908a77fa116828586421b9c338e071caae971854849207bbf84a224fe` (in `workers/boss/wrangler.jsonc` env.production) |
| Boss editorial target | `hakandndr/americawhat` / `main` (enforced in code for `ENVIRONMENT=production`) |
| GitHub Environments | `production` (branch `main`), `staging` (`main`, `backup/*`, `codex/*`); reviewer `hakandndr`; admin bypass off |

Current versions: [CURRENT-STATE.md](CURRENT-STATE.md).

## Secrets (names)

| Where | Name | Notes |
|---|---|---|
| Web Worker | `REACTION_GUARD_SECRET` | random, production-only |
| Boss Worker | `BOSS_CSRF_SECRET` | random, production-only |
| Boss Worker | `GITHUB_TOKEN` | fine-grained PAT: only `hakandndr/americawhat`, Contents read/write, ≤ 90 days |
| GitHub Environment `production` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | token: Workers Editor on the two production Workers only |
| GitHub Environment `staging` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | token: Workers Editor on the two staging Workers only |
| Repository (legacy) | `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | Hostinger rollback only; delete at retirement ([POST-CUTOVER.md](POST-CUTOVER.md)) |

List names without values:
`npx wrangler secret list --env production --config workers/boss/wrangler.jsonc`,
`gh secret list --env production --repo hakandndr/americawhat`.

## Rotation

- **Random Worker secrets:** `pwsh -NoProfile -File scripts/release/prepare-production-secrets.ps1 -Part Generated`
  writes fresh values to owner-only files outside the repository; upload with
  `npx wrangler secret bulk <file> --env production --config workers/<web|boss>/wrangler.jsonc`
  (creates and serves a new version), then delete the files. Rotating
  `BOSS_CSRF_SECRET` invalidates open Boss forms (reload).
- **Boss GitHub PAT:** create the new fine-grained token (scope above), then
  `pwsh -NoProfile -File scripts/release/prepare-production-secrets.ps1 -Part GitHubPat`
  (type EVET; reads and clears the clipboard), `wrangler secret bulk` as above,
  delete the file, revoke the old PAT.
- **CI tokens:** create the new per-Worker token, store it with
  `gh secret set CLOUDFLARE_API_TOKEN --env production --repo hakandndr/americawhat`
  (prompts, no echo), revoke the old one.

## Configuration helpers

- `node scripts/release/cf-release.mjs check-config production` — refuses
  placeholders and staging values.
- `node scripts/release/set-production-config.mjs --app-db <uuid> --analytics-db <uuid> [--access-aud <hex>]`
  — writes ids into both configs (refuses staging ids/AUD).
- `node scripts/release/cf-release.mjs no-routes <web|boss>` — a git-ignored
  config without custom domains, used once to create the Workers unrouted.
- D1 schema changes: `npx wrangler d1 migrations apply <APP_DB|ANALYTICS_DB> --remote --env production --config workers/web/wrangler.jsonc`
  **before** deploying code that needs them (the deploy's schema gate checks this).
