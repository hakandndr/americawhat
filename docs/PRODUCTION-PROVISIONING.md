# americawhat — Production provisioning (isolated, partly executed)

Exact, reproducible steps for the production resources. Steps 1, 3 (generated
secrets), 4 and part of 5 were executed on 2026-10-15 under the owner's
provisioning authorization; nothing is attached to a domain or reachable.

## Status (2026-10-15)

| Resource | State | Identifier |
|---|---|---|
| D1 `americawhat-app-production` | **created** (WNAM), migration 0001_app_core applied, tables empty | `3097933b-4feb-4e50-bb59-760fd06a640e` |
| D1 `americawhat-analytics-production` | **created** (WNAM), migration 0001_analytics_core applied, tables empty | `1012183d-96cd-4d7f-8e93-ca247ca43589` |
| Worker `americawhat-web-production` | **created** without routes; workers.dev **disabled**, preview URLs **disabled**, custom domains **none** (API-verified); `*.workers.dev` answers 404 | script tag ff4ea0b048f2431d902f78befc44659e, version `7dfff6ea-19b7-46c1-99b9-1f6a94184b8c` (100 %) |
| Worker `americawhat-boss-production` | **created** the same way; empty Access AUD → every request 503 | script tag aed1cf90d4214b98924c3706cd58edfa, version `f1d4b564-ed36-4355-b56d-a1ad6ed4459c` (100 %) |
| Secrets | web: `REACTION_GUARD_SECRET`; boss: `BOSS_CSRF_SECRET` — fresh random values, never shown; local files deleted after upload | — |
| Boss `GITHUB_TOKEN` | **missing** (owner PAT, step 3) → Boss cannot write to any repository | — |
| Access app `boss.americawhat.com` | **blocked**: zone not in the account; CLI has no Access permission ([DNS-READINESS.md](DNS-READINESS.md#boss-access-dependency)) | AUD pending |
| GitHub Environments | **created** with required reviewer, no admin bypass, branch rules ([DEPLOYMENT.md](DEPLOYMENT.md)) | — |
| Cloudflare API tokens for CI | **missing** (owner; only the dashboard can create them) | — |
| DNS zone | **not added** (read-only checklist in [DNS-READINESS.md](DNS-READINESS.md)) | — |

Release deployed into the hidden Workers: build of 1790f6d (static inventory
identical to the staged release except `rss.xml`), `RELEASE_ID` = that SHA.
Bindings: only the two production D1 databases (no service binding, no staging
resource); the Boss may write only `hakandndr/americawhat` / `main` and has no
token yet. Staging Workers stayed on their versions (Web 1346af78…, Boss
855652dd…) and staging D1 was not touched.

Run wrangler with the owner's OAuth login (`npx wrangler login`), with
`CLOUDFLARE_API_TOKEN` unset in the shell. Never paste a secret into a
command line, chat, commit or log.

## Account facts

- Workers Paid and R2 Paid are **active** (owner-verified billing dashboard,
  October 2026 usage: no additional charges). Implications:
  - CPU: default 30 s per request, up to 5 min. Production configs set explicit
    ceilings: Web `limits.cpu_ms` 1000, Boss 10000 (measured: Weekly review
    ~11 ms warm / ~31 ms cold; edge Trending is one D1 read).
  - Billing: 10 M requests + 30 M CPU-ms included per month. Static asset
    requests are free **unless the Worker runs first**; production uses
    `run_worker_first: true` (301 trailing-slash parity with Apache), so every
    page request is a billed Worker request. At current traffic (~1,000 page
    views in 100 days on Hostinger) this is far inside the included amount.
  - D1 usage is billed separately from Workers; monitor in the dashboard.
- Access team domain: `dndrnet.cloudflareaccess.com`; owner identity
  `hakan@dndr.net`.

## 0. Preconditions

1. The `americawhat.com` zone is active on Cloudflare in this account, with all
   records copied exactly (MX/SPF/DKIM/DMARC stay pointing at Hostinger,
   DNS-only), and the apex/www records pointing at the Hostinger **origin**
   server (Hostinger CDN disabled first; it does not work with external
   nameservers). Custom domains cannot be attached before this. Procedure:
   [DNS-READINESS.md](DNS-READINESS.md), steps A1–A3.
2. This branch's code reviewed; `npm test` green; `node scripts/release/reconcile-main.mjs` ok.

## 1. D1 databases

```bash
npx wrangler d1 create americawhat-app-production --location wnam
```

```bash
npx wrangler d1 create americawhat-analytics-production --location wnam
```

Write the two ids into both configs (refuses staging ids, malformed or equal ids):

```bash
node scripts/release/set-production-config.mjs --app-db <app uuid> --analytics-db <analytics uuid>
```

Apply the schema (empty databases, so nothing to back up yet):

```bash
npx wrangler d1 migrations apply APP_DB --remote --env production --config workers/web/wrangler.jsonc
```

```bash
npx wrangler d1 migrations apply ANALYTICS_DB --remote --env production --config workers/web/wrangler.jsonc
```

## 2. Boss Access application

Zero Trust → Access → Applications → self-hosted, domain `boss.americawhat.com`,
policy Allow, Include: emails `hakan@dndr.net` only, session ≤ 24 h. Copy its
AUD tag:

```bash
node scripts/release/set-production-config.mjs --app-db <app uuid> --analytics-db <analytics uuid> --access-aud <64-hex AUD>
```

```bash
node scripts/release/cf-release.mjs check-config production
```

Commit the config change (it contains ids, not secrets).

## 3. Worker secrets (outside the repository)

Generated secrets (done 2026-10-15; run again only to rotate):

```bash
pwsh -NoProfile -File scripts/release/prepare-production-secrets.ps1 -Part Generated
```

Boss GitHub PAT (owner, interactive; copy the new PAT first, type EVET):

```bash
pwsh -NoProfile -File scripts/release/prepare-production-secrets.ps1 -Part GitHubPat
```

```bash
npx wrangler secret bulk <printed boss-production-github.json path> --env production --config workers/boss/wrangler.jsonc
```

Then delete the file. The Boss has no route, so the new version this creates
is still unreachable.

Prepare one secrets file per Worker in a protected directory outside the
repository (same pattern as `scripts/release/prepare-staging-secrets.ps1`):

| Worker | Secret | Value source |
|---|---|---|
| web | `REACTION_GUARD_SECRET` | new random 32 bytes (not the staging value) |
| boss | `BOSS_CSRF_SECRET` | new random 32 bytes (not the staging value) |
| boss | `GITHUB_TOKEN` | new fine-grained PAT: only `hakandndr/americawhat`, Contents read/write, expiry ≤ 90 days. Not the staging PAT, not the Hostinger Boss credential |

Optional/never in production: `STAGING_TEST_KEY`, `BOSS_DEV_JWKS`,
`COLLECT_VISITS` (check-config refuses `COLLECT_VISITS` in production vars).

## 4. Create the Workers without domains

```bash
node scripts/release/cf-release.mjs no-routes web --allow-pending-access
```

```bash
node scripts/release/cf-release.mjs no-routes boss --allow-pending-access
```

```bash
npm run build:rc
```

```bash
npx wrangler deploy --config workers/web/wrangler.no-routes.jsonc --env production --secrets-file <web secrets file>
```

```bash
npx wrangler deploy --config workers/boss/wrangler.no-routes.jsonc --env production --secrets-file <boss secrets file>
```

The Workers now exist, unreachable (no workers.dev, no preview URLs, no
domain). Delete the generated `wrangler.no-routes.jsonc` files and the
secrets files.

## 5. CI credentials (GitHub)

Create the account-owned API token for production: Workers **Editor** on the
two production Workers only, **D1 Read**; no zone/DNS/Access permissions. In
GitHub → Settings → Environments → `production`: required reviewer
`hakandndr`, deployment branches `main`, secrets `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`. Do **not** set `CF_PRODUCTION_DEPLOY_ENABLED` yet.
(Details: [DEPLOYMENT.md](DEPLOYMENT.md).)

## 6. Validation before cutover (read-only)

```bash
node scripts/release/cf-release.mjs check-config production
```

```bash
npx wrangler deployments status --env production --config workers/web/wrangler.jsonc
```

```bash
npx wrangler d1 migrations list APP_DB --remote --env production --config workers/web/wrangler.jsonc
```

```bash
npx wrangler secret list --env production --config workers/boss/wrangler.jsonc
```

Expected: one version at 100 % per Worker, "No migrations to apply", secret
names only. The domains are attached during cutover (`wrangler triggers deploy`,
[PRODUCTION-MIGRATION-PLAN.md](PRODUCTION-MIGRATION-PLAN.md)).

## Not provisioned → what happens

- `check-config production` exits 1 and lists the placeholders.
- The deploy workflow's build job fails at that step; nothing is uploaded.
- `no-routes` refuses to write a config.
- A Boss deployed with an empty AUD answers 503 (fail closed), and a Boss
  with `ENVIRONMENT=production` refuses any GitHub target other than
  `hakandndr/americawhat` / `main`.
