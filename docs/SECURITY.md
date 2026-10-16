# americawhat — Security

## 1. Boss (administration)

- **Hostname:** `boss.americawhat.com` only (never `americawhat.com/boss/*` on
  Cloudflare). Production config: `workers/boss/wrangler.jsonc` → `env.production`.
- **Edge:** a Cloudflare Access application for `boss.americawhat.com` allowing
  only `hakan@dndr.net` (team `dndrnet.cloudflareaccess.com`). Live since
  2026-10-16 ("AmericaWhat Boss Production"; AUD in `env.production`); anonymous
  requests are redirected to the Access login.
- **Worker-side verification** (`workers/boss/src/auth.mjs`), independent of the
  edge: the `Cf-Access-Jwt-Assertion` must be RS256, signed by a key from the
  team's JWKS, with the expected issuer and audience, unexpired and already
  valid, and its `email` must be in `BOSS_ALLOWED_EMAILS`. Missing configuration
  or an unreachable key set fails closed (503). The
  `Cf-Access-Authenticated-User-Email` header alone is never trusted.
- **CSRF** (`csrf.mjs`): every POST needs `Origin` = `BOSS_ORIGIN`, a
  `Sec-Fetch-Site` of `same-origin` when present, and a form token bound to the
  verified identity and a 12-hour window (HMAC under `BOSS_CSRF_SECRET`).
- **Responses:** `Content-Security-Policy` without scripts (Analytics alone
  allows its own `script-src 'self'`), `frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, `no-store`, `noindex`, `Referrer-Policy: same-origin`
  (not `no-referrer`: under that policy browsers send `Origin: null` on
  same-origin form POSTs, which the CSRF check rightly refuses). Every value is
  HTML-escaped.
- **Destructive actions** need a typed confirmation (item id, date, or the
  SHA-256 prefix of an uploaded file) and are written to the append-only audit.
- **Staging Boss** is reachable only through its own Access application
  (`dndr-staging-owner-only`) on its workers.dev URL, and may write only the
  staging content repository. Local review uses `npm run preview:boss`, whose
  loopback-only identity seam is ignored outside `ENVIRONMENT=local` (tested);
  every non-production page carries an environment banner.

## 2. Secrets

| Secret | Where | Notes |
|---|---|---|
| `GITHUB_TOKEN` | Boss Worker secret only | Fine-grained PAT, repository `hakandndr/americawhat` only, Contents read/write. Expiry is shown on Boss → Health (warning at 14 days). Commits are authored as `Hakan Dundar <hakan@dndr.net>`. |
| `BOSS_CSRF_SECRET` | Boss Worker secret | Random, per environment. |
| `REACTION_GUARD_SECRET` | web Worker secret | Random, per environment (staging set 2026-10-14). |
| `STAGING_TEST_KEY` | web Worker secret, staging only | Lets the smoke test store a page view on staging; the local copy lives in git-ignored `private/`. Never set in production. |
| `FTP_*` | GitHub Actions secrets | Hostinger only; delete at Hostinger retirement. |
| Hostinger `boss/config.php`, `dndr-relay.config.php` | Server only | Never copied into the repository or a chat; revoke the PAT and the relay key at retirement. |

A GitHub App was considered and rejected for now: its commits would be authored
by an `app[bot]` account, which would appear among the repository contributors.

## 3. Public surface (web Worker)

- No GET changes state. Writes are POST with an allowed `Origin`.
- Reactions: published ids only (bundled with the deployment), four reaction
  keys, one count per address/item/reaction/LA day, 30 reactions per address per
  hour, atomic D1 batch. Addresses are stored only as HMACs, expired after 48 h.
- Page views: UUID per view, path must start with a single `/`, size limits,
  120 events per address per 10 minutes. Outside production nothing from a
  real visitor is stored (`COLLECT_VISITS` defaults to `test-only`).
- D1 accepts at most 100 bound parameters per statement; every `IN (…)` query is
  chunked and the test adapter enforces the limit. (Found in staging: the
  homepage's 124-id read returned 500 before the fix.)
- Static output: `public/.assetsignore` keeps every `.php`, `.htaccess`,
  `aw_votes.json`, `studio/`, `boss/` and `analytics/` file out of the upload;
  `npm run verify:static` fails the build if any would be uploaded or if a
  secret marker appears; the Worker answers 404 for anything else under
  `/analytics/`. Verified on staging (smoke test).

## 4. Findings in the former Hostinger implementation

Real defects of the PHP site (all fixed by the Cloudflare implementation; the
Hostinger files stay dormant until retirement — do not use the old `/boss/`):

1. `vote.php` reads without a lock and writes with truncation: a concurrent
   read of a half-written file decodes to `[]` and the next write keeps only one
   vote — **all counts can be lost**. It also accepts GET (a vote can be cast by
   an `<img>` tag) and any well-formed id.
2. The Studio panel approves with two separate commits; if the second fails, the
   story is published but stays pending and can be published twice.
3. Approving a story whose title slug equals an existing one changes the URL of
   the existing article (one such pair already exists).
4. `/.ftp-deploy-sync-state.json` is publicly readable (file inventory).
5. `/boss/` is a password form on the public internet without rate limiting or
   session regeneration.
6. Every visitor address is sent to `ip-api.com` over plain HTTP.

Hypothetical or low risk: the PHP session cookie flags depend on `php.ini`;
`robots.txt` names `/studio/`.

## 4a. Verification review (2026-10-14) — defects found in the new code and fixed

1. Reaction read with more than 100 ids failed on D1 (homepage). Fixed, tested,
   staging verified.
2. The public staging hostname stored real visitors' addresses and user agents.
   Fixed (test-key gate), staging verified; the 3 rows already stored await an
   owner decision.
3. The legacy import's presence check would exceed the D1 parameter limit on a
   real-size log. Fixed and restructured as idempotent SQL.
4. SQL rendering could have altered whitespace inside values. Fixed, with a
   byte-for-byte equivalence test.
5. A same-corpus re-run after a deletion could have re-inserted deleted rows.
   Now impossible (event insert requires the ledger row and the retention floor).
6. Analytics export audit rows contained the raw query string (which can hold
   an IP filter). Now only the filter names are recorded.

Resolved: the account is on Workers Paid; production sets explicit CPU limits.

## 5. Repository hygiene

- Commits: `Hakan Dundar <hakan@dndr.net>` (repository-local git config). The
  versioned hooks in `.githooks/` (enable with `git config core.hooksPath
  .githooks`) refuse co-author trailers, tool signatures and private files; CI
  checks commit messages on pushed branches.
- `.claude/`, `.dev.vars`, `.wrangler/`, `.venv/`, `private/`, `backups/`,
  bundles, local databases and `aw_panel_log*.txt` are ignored.
- Five historical commits (July 2026) carry a co-author trailer naming an
  assistant tool. They are left untouched: rewriting history needs a separate
  owner decision and a force-push.
- GitHub Contributors (verified 2026-10-14): only `hakandndr` is a linked
  contributor; `aw-bot` (fetch workflow) and `hakandundar@gmail.com` (22 older
  commits) are unlinked and not listed. Do not switch the fetch identity to
  `github-actions[bot]`: that account would be listed.
