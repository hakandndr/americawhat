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
| Worker `americawhat-boss-production` | **created** the same way; since 2026-10-16 carries the production Access AUD (assertions for any other audience, issuer, key, time or email are refused — `tests/boss-production-access.test.mjs`); still no route, workers.dev or preview URL (API-verified) | script tag aed1cf90d4214b98924c3706cd58edfa, version `7346d271-5ba9-4491-ac56-5d0217e4cd80` (100 %; previous f1d4b564…) |
| Secrets | web: `REACTION_GUARD_SECRET`; boss: `BOSS_CSRF_SECRET` — fresh random values, never shown; local files deleted after upload | — |
| Boss `GITHUB_TOKEN` | **missing** (owner PAT, step 3) → Boss cannot write to any repository | — |
| Access app `boss.americawhat.com` | **created by the owner 2026-10-16**: "AmericaWhat Boss Production", team `dndrnet.cloudflareaccess.com`, allow `hakan@dndr.net` only (owner-reported; the CLI cannot read Access apps). Team JWKS reachable (2 RS256 keys). Hostname **not attached** to the Worker yet | AUD `6b54c07908a77fa116828586421b9c338e071caae971854849207bbf84a224fe` (committed in env.production) |
| GitHub Environments | **created** with required reviewer, no admin bypass, branch rules ([DEPLOYMENT.md](DEPLOYMENT.md)) | — |
| Cloudflare API tokens for CI | **missing** (owner; only the dashboard can create them) | — |
| DNS zone | **active on Cloudflare** (observed 2026-10-16: nameservers `courtney.ns.cloudflare.com`, `porter.ns.cloudflare.com` at 1.1.1.1 and 8.8.8.8; all 13 records answer exactly as the export, DNS-only; site still on the Hostinger origin) — [DNS-READINESS.md](DNS-READINESS.md) | — |

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

## Status update (2026-10-16, later)

- Boss `GITHUB_TOKEN` uploaded by the owner; production Boss secrets are
  `BOSS_CSRF_SECRET`, `GITHUB_TOKEN` (names verified). The upload created Boss
  version `14998af5-7f54-470c-852f-7b24cb9f12f0` (still no route, workers.dev or
  preview URL — API-verified). Web secrets: `REACTION_GUARD_SECRET`.
- GitHub Environments `production` and `staging` both hold
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (names verified);
  tokens are per-Worker **Editor** only (owner-reported; values never read).
  `CF_PRODUCTION_DEPLOY_ENABLED` unset (0 repository variables).
- The D1 permission gap is closed by the schema gate (no D1 permission needed).
  Applied migrations in all four AmericaWhat D1 databases match this release
  (checked read-only with owner OAuth).

## 5. Remaining credentials (owner; values never in chat, commits or logs)

### 5a. Boss GitHub PAT (production)

1. GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token.
2. Name `americawhat-boss-production`; resource owner `hakandndr`;
   expiration ≤ 90 days (note the date for rotation).
3. Repository access: **Only select repositories** → `hakandndr/americawhat`.
4. Repository permissions: **Contents: Read and write** (Metadata: Read is
   added automatically). Nothing else; no account permissions.
5. Copy the token, then in PowerShell 7 in the worktree:
   `pwsh -NoProfile -File scripts/release/prepare-production-secrets.ps1 -Part GitHubPat`
   (type EVET; the clipboard is read, validated and cleared; the value is not shown).
6. `npx wrangler secret bulk <printed path> --env production --config workers/boss/wrangler.jsonc`
   (creates a new Boss version; the Boss is still unrouted), then delete the file.
7. Check names only: `npx wrangler secret list --env production --config workers/boss/wrangler.jsonc`
   → `BOSS_CSRF_SECRET`, `GITHUB_TOKEN`.

Not the staging PAT, not the old Hostinger Boss credential.

### 5b. Cloudflare API tokens for GitHub Actions

Create **two** account-owned tokens (Cloudflare dashboard → Manage account →
Account API tokens → Create token → Custom token):

| | production | staging |
|---|---|---|
| Name | `americawhat-ci-production` | `americawhat-ci-staging` |
| Workers | **Editor**, scoped to the individual Workers `americawhat-web-production` and `americawhat-boss-production` | **Editor**, scoped to `americawhat-web-staging` and `americawhat-boss-staging` |
| D1 | **none** — the schema gate reads migrations through the Worker's own binding ([DEPLOYMENT.md](DEPLOYMENT.md)) | none |
| Zone / DNS / Access / Routes | none | none |
| Account resources | Hakan@dndr.net's Account only | same |
| Expiry | date noted for rotation | same |

Store each without echoing it (the command prompts for the value):

```bash
gh secret set CLOUDFLARE_API_TOKEN --env production --repo hakandndr/americawhat
```

```bash
gh secret set CLOUDFLARE_API_TOKEN --env staging --repo hakandndr/americawhat
```

Check names only: `gh secret list --env production --repo hakandndr/americawhat`
→ `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. Leave
`CF_PRODUCTION_DEPLOY_ENABLED` unset. The tokens cannot be exercised before
the merge (the deploy workflow is not on `main` yet).

## 5 (original). CI credentials (GitHub)

Create the account-owned API token for production: Workers **Editor** on the
two production Workers only; no D1/zone/DNS/Access permissions. In
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

(owner OAuth only; the CI tokens deliberately cannot run this)

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
