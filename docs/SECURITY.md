# americawhat — Security

## 1. Boss (administration)

- **Hostname:** `boss.americawhat.com` only (never `americawhat.com/boss/*` on
  Cloudflare). Production config: `workers/boss/wrangler.jsonc` → `env.production`.
- **Edge:** a Cloudflare Access application for `boss.americawhat.com` allowing
  only `hakan@dndr.net` (team `dndrnet.cloudflareaccess.com`, as used by OC-CA).
  It does not exist yet; creating it is part of the production checklist.
- **Worker-side verification** (`workers/boss/src/auth.mjs`), independent of the
  edge: the `Cf-Access-Jwt-Assertion` must be RS256, signed by a key from the
  team's JWKS, with the expected issuer and audience, unexpired and already
  valid, and its `email` must be in `BOSS_ALLOWED_EMAILS`. Missing configuration
  or an unreachable key set fails closed (503). The
  `Cf-Access-Authenticated-User-Email` header alone is never trusted.
- **CSRF** (`csrf.mjs`): every POST needs `Origin` = `BOSS_ORIGIN`, a
  `Sec-Fetch-Site` of `same-origin` when present, and a form token bound to the
  verified identity and a 12-hour window (HMAC under `BOSS_CSRF_SECRET`).
- **Responses:** `Content-Security-Policy` without scripts,
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `no-store`, `noindex`.
  No client JavaScript; every value is HTML-escaped.
- **Destructive actions** need a typed confirmation (item id, date, or the
  SHA-256 prefix of an uploaded file) and are written to the append-only audit.
- **Staging Boss** has no route and no workers.dev URL (verified: Cloudflare
  answers error 1042). It is exercised locally with `npm run preview:boss`,
  whose loopback-only identity seam is ignored outside `ENVIRONMENT=local`
  (tested).

## 2. Secrets

| Secret | Where | Notes |
|---|---|---|
| `GITHUB_TOKEN` | Boss Worker secret only | Fine-grained PAT, repository `hakandndr/americawhat` only, Contents read/write. Expiry is shown on Boss → Health (warning at 14 days). Commits are authored as `Hakan Dundar <hakan@dndr.net>`. |
| `BOSS_CSRF_SECRET` | Boss Worker secret | Random, per environment. |
| `REACTION_GUARD_SECRET` | web Worker secret | Random, per environment (staging set 2026-10-14). |
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
  120 events per address per 10 minutes.
- Static output: `public/.assetsignore` keeps every `.php`, `.htaccess`,
  `aw_votes.json`, `studio/`, `boss/` and `analytics/` file out of the upload;
  `npm run verify:static` fails the build if any would be uploaded or if a
  secret marker appears; the Worker answers 404 for anything else under
  `/analytics/`. Verified on staging (smoke test).

## 4. Findings in the current production (Hostinger)

Real defects (fixed in the new implementation, still present on Hostinger):

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
