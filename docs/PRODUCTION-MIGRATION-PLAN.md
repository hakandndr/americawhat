# americawhat — Production migration plan (authoritative, 2026-10-15)

Supersedes the Turkish plan of the same date (git history) and the cutover /
rollback parts of [CLOUDFLARE-MIGRATION.md](CLOUDFLARE-MIGRATION.md). Each
numbered step needs its own owner approval. Nothing below has been executed
in production.

Companion documents: [DEPLOYMENT.md](DEPLOYMENT.md) (CI/CD),
[PRODUCTION-PROVISIONING.md](PRODUCTION-PROVISIONING.md) (exact commands),
[OG-IMAGES.md](OG-IMAGES.md), [HOSTINGER-COMPATIBILITY.md](HOSTINGER-COMPATIBILITY.md).

## Source of truth

| Ref | SHA | Meaning |
|---|---|---|
| `codex/staging-rc` = `origin/backup/cloudflare-staging-2026-10-15` | 6f21c0e | Release branch: staging work + production preparation; CI run 38833173496 green |
| `origin/dev/cloudflare-native` | 4438907 | Older development line; ancestor of both |
| `origin/main` | 36e1c9b (fetched 2026-10-15 evening) | Hostinger production; 2 fetch-only commits not in the release branch (9f6c3fc, 36e1c9b) |

`node scripts/release/reconcile-main.mjs` (read-only) on that state: merge
base eaef194, conflict-free merge tree, main changed only `pending.json`,
`seen_ids.json`, `fetch-status.json`; published 124 → 124, pending 146 → 146,
seen 11,492 → 11,492; vote seed and the 125 approved OG files unchanged.

## Prerequisites (before the cutover window)

| # | Item | Status |
|---|---|---|
| P1 | Hostinger baseline backup + SHA-256 manifest | **Done** (owner, 2026-10-15) |
| P2 | Source backup branch on GitHub | **Done** (`backup/cloudflare-staging-2026-10-15`) |
| P3 | Workers Paid plan | **Done** (owner-verified active) |
| P4 | Staging Web + Boss operational and accepted | **Done** (Web c08cdfc, Boss 209aa9e) |
| P5 | `log_df.php` POST compatibility | **Done** (compatible, [HOSTINGER-COMPATIBILITY.md](HOSTINGER-COMPATIBILITY.md)) |
| P6 | OG strategy | **Done in code** (frozen archive + pinned renderer); not deployed |
| P7 | Gated CI/CD replacing FTP | **Done in code**; not on GitHub yet |
| P8 | Push the release branch for review (CI only) | **Done** (6f21c0e, CI 38833173496 green) |
| P9 | DNS on Cloudflare with the site still on the Hostinger origin | **Done 2026-10-16** (owner): CDN disabled, zone active (`courtney/porter.ns.cloudflare.com`), records verified 15/15 DNS-only. Owner e-mail test pending — [DNS-READINESS.md](DNS-READINESS.md) |
| P10 | Production D1, Access app, secrets, Workers without domains, CI token | **Done 2026-10-16:** D1 ×2 + migrations, Workers without exposure, secrets incl. Boss `GITHUB_TOKEN`, GitHub Environments with per-Worker Editor tokens, Access app + AUD. CI needs no D1 permission (schema gate) |
| P10b | Schema-aware release on staging (the deploy schema gate reads `/api/health` digests) | Pending — staging release by the documented local procedure; production gets it in cutover step 6 |
| P11 | DNDR producer for native forwarding | Pending — DNDR-side approval; otherwise accept a DNDR gap |
| P12 | Decisions: privacy "~90 days" wording, 3 staging visitor rows / 2 votes | Pending — owner |

## Cutover (one window, in this order)

1. **Freeze editorial.** No Boss approvals on Hostinger from here on. The
   fetch workflow may keep running (it only touches candidate files).
2. **Tag the rollback source:** `git tag hostinger-final origin/main` and push
   the tag (a tag push triggers nothing).
3. **Reconcile:** `git fetch origin`, then
   `node scripts/release/reconcile-main.mjs` must print `"ok": true`.
4. **Final snapshots (now, not earlier):** download `analytics/aw_panel_log.txt`
   and `analytics/aw_votes.json` (S1) into the private backup folder; record
   their SHA-256.
5. **Merge** the release branch into `main` through a reviewed PR (merge
   commit; content files from `main` win, as reconcile showed). Effect: the
   FTP deploy is retired; `deploy-cloudflare.yml` runs but skips (variable unset).
6. **Content gate:** CI on the merge commit green; published items without an
   approved OG image are listed by `reconcile-main.mjs` and rendered by the build.
   Then upload both production Workers from the merged `main` with the
   `no-routes` procedure (still no domains): this is always required, because
   the provisioned versions predate the schema-aware `/api/health` that the CI
   schema gate in step 10 reads, and it also picks up any content published
   since provisioning.
7. **Import S1:** `npm run analytics:legacy -- sql <S1 log> --out private/s1.sql`,
   `npx wrangler d1 execute americawhat-analytics-production --remote --env production --config workers/web/wrangler.jsonc --file private/s1.sql`
   twice (second run must add 0); delete the SQL file. The vote baseline is
   imported in step 9 (Boss needs its domain for Access).
8. **Attach domains:** `npx wrangler triggers deploy --env production --config workers/web/wrangler.jsonc`
   The custom domains replace the apex and `www` **origin** records (Hostinger CDN was already disabled in P9/A1).
   and the same for Boss. Custom domains replace the apex/www/boss records;
   email records are untouched.
9. **Verify:** `npm run smoke -- https://americawhat.com`, `npm run parity:live`,
   Boss via Access (another identity is refused), Boss → Reactions → import S1
   `aw_votes.json` (baseline), one manual page view and reaction, Boss
   Analytics shows native rows, `/api/health` ok, Workers/D1 metrics, social
   preview of one story.
10. **Enable CI deploys:** set `CF_PRODUCTION_DEPLOY_ENABLED=true`, run
    "Deploy to Cloudflare" with target `production` and approve it in the
    Environment. Its smoke test now reaches Cloudflare; this proves the
    pipeline and the automatic rollback targets. (Never before step 8: the
    smoke test would hit Hostinger and roll back.)
11. **72 h later:** S2 snapshots from Hostinger (stale DNS clients) → delta
    imports (analytics `sql` again; reactions delta). Then the observation window.
12. **After 30 days, separately approved:** revoke the Hostinger Boss
    credential, delete the FTP secrets, remove Hostinger web files. The
    Hostinger plan stays for **email**.

## Rollback

| Situation | Action | Data effect |
|---|---|---|
| Bad release (code) | "Roll back Cloudflare Worker" workflow, or automatic rollback in the deploy job | none |
| Site must return to Hostinger (before step 12) | Remove the Workers' custom domains (Workers → Domains & Routes), recreate the DNS-only **origin records** `@ A 45.89.205.38`, `@ AAAA 2a02:4780:1:2242:0:145e:6975:6`, `www CNAME americawhat.com` ([DNS-READINESS.md](DNS-READINESS.md#rollback-after-the-worker-cutover); no nameserver change, Hostinger CDN stays off); Boss → Reactions → export `aw_votes.json` and upload to Hostinger `analytics/`; if stories were published on Cloudflare, republish Hostinger with "Deploy to Hostinger" on a branch made from `hostinger-final` plus the current `src/data/*.json` | native analytics stay in D1; the PHP log continues; no double count |
| D1 data damage | Forward fix; Time Travel restore only as last resort (rewinds ALL # numbering) | — |
| CI misbehaves | Unset `CF_PRODUCTION_DEPLOY_ENABLED`; deploys stop, live version keeps serving | none |

Hostinger must stay intact for this: see [HOSTINGER-COMPATIBILITY.md §5](HOSTINGER-COMPATIBILITY.md).

## Superseded instructions (do not follow)

- Anything that merges `dev/cloudflare-native` into `main`, or merges before
  the cutover window (CLOUDFLARE-MIGRATION §0 "Branch reconciliation rule",
  §1 "Pre-merge checks").
- CLOUDFLARE-MIGRATION §4.5 "keep the FTP deploy running during observation":
  the FTP deploy is retired by the merge; Hostinger rollback uses `hostinger-final`.
- Running `python scripts/gen-og.py` to regenerate all images (old behaviour);
  it now renders only missing images and never touches `public/og/`.
- "Workers plan not verified / Free 10 ms CPU risk": resolved, Workers Paid.
- Production deploy via local `wrangler deploy --env production` after cutover:
  use the workflow; local `wrangler deploy` is for first creation only
  (step P10, without domains).
