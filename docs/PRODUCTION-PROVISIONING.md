# americawhat — Production provisioning (prepared, NOT executed)

Exact, reproducible steps for creating the production resources once the owner
authorizes provisioning. **None of these steps has been run.** No production
D1 database, Worker, Access application, token, secret, route or DNS record
exists as of 2026-10-15. Every step needs explicit owner approval.

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
   DNS-only), and the apex/www records still pointing at Hostinger. Custom
   domains cannot be attached before this. (Today the nameservers are
   Hostinger's; [CLOUDFLARE-MIGRATION.md](CLOUDFLARE-MIGRATION.md) §2 describes
   the DNS move.)
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
node scripts/release/cf-release.mjs no-routes web
```

```bash
node scripts/release/cf-release.mjs no-routes boss
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
