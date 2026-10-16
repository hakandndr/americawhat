# americawhat — operations

Day-to-day work on the live site. Deployment and rollback: [DEPLOYMENT.md](DEPLOYMENT.md).
The pre-cutover operations log (Hostinger panel, FTP, staging sprints) is in
[archive/status/OPERATIONS-2026-10-15.md](archive/status/OPERATIONS-2026-10-15.md).

## Content loop

1. `fetch.yml` (02:00, 14:00, 20:00 UTC) adds RSS candidates to
   `src/data/pending.json` on `main` and remembers them in `seen_ids.json`.
2. The owner reviews them in Boss → Weekly review (approve, reject with a
   reason, skip) and edits published stories in Boss → Published. Boss reads
   `main` through the GitHub API and writes `published.json` + `pending.json` as
   **one** fast-forward commit; if `main` moved, it recomputes on the new head.
3. That commit starts "Deploy to Cloudflare"; the owner approves the
   `production` deployment in GitHub; the site is live a few minutes later.
4. New stories get an OG image from the pinned renderer at build time
   ([OG-IMAGES.md](OG-IMAGES.md)).

Editorial rules: [EDITORIAL-GUIDE.md](EDITORIAL-GUIDE.md).

Batch curation outside Boss (rare): write a curation file and apply it to the
current `pending.json` with `node scripts/editorial/apply-curation.mjs <file>`
on a fresh `origin/main`; never merge with `-X ours` (it silently drops the
other side's candidates). If the push is refused because `main` moved, reset to
the new head and re-apply the curation file.

## Local development

```bash
npm ci
git config core.hooksPath .githooks
npm run dev
npm test
npm run build:rc
npm run verify:static
```

- Git identity for this repository: `Hakan Dundar <hakan@dndr.net>`; the hooks
  refuse co-author trailers, tool signatures and private files.
- OG renderer: `python -m pip install --only-binary=:all: --require-hashes -r scripts/og/requirements.txt`;
  full OG tests need `OG_PYTHON` pointing at that Python.
- Wrangler uses the owner's OAuth login; an invalid `CLOUDFLARE_API_TOKEN` in
  the environment fails with code 9109 — unset it.

### Boss locally

```bash
npm run test:boss-preview
npm run preview:boss
```

The real Boss runs in workerd at http://127.0.0.1:8788 with a locally signed
identity, its own local D1 (emptied at every start), synthetic analytics and
reactions, and an in-memory copy of GitHub; nothing leaves the machine. Try
`tests/fixtures/votes/aw_votes-sample.json` for a Reactions import. If port
8789 is in use, an earlier preview is still running.

### Web Worker locally

```bash
npx wrangler d1 migrations apply americawhat-app-staging --local --config workers/web/wrangler.jsonc
npx wrangler d1 migrations apply americawhat-analytics-staging --local --config workers/web/wrangler.jsonc
npx wrangler dev --config workers/web/wrangler.jsonc --var PUBLIC_ORIGINS:http://127.0.0.1:8787 --var REACTION_GUARD_SECRET:local
```

## Checks against the live site (read-only)

```bash
npm run smoke -- https://americawhat.com
npm run parity:live
node scripts/release/cf-release.mjs schema-gate https://americawhat.com
```

`npm run smoke` never writes on the production hostname (`--write` is refused there).

## Data operations

- **Legacy analytics import** (Hostinger log, offline SQL): see the S2 steps in
  [POST-CUTOVER.md](POST-CUTOVER.md#s2-reconciliation-from-2026-10-19). Small
  deltas can also go through Boss → Analytics → Legacy import (same statements).
- **Reactions import** (`aw_votes.json`): Boss → Reactions; preview, then confirm
  with the SHA-256 prefix. The first import is the baseline, later ones are
  deltas; decreases and repeats are refused. Boss → Reactions → export writes
  the current counts in the same format.
- **Retention**: manual only. Boss → Analytics → Data operations shows records
  past the 90-day target and offers "Delete before date"; nothing is deleted
  automatically.
- **D1 schema changes**: apply the migration by hand before deploying code that
  needs it ([PRODUCTION-PROVISIONING.md](PRODUCTION-PROVISIONING.md#configuration-helpers)).
