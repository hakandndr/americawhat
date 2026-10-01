# americawhat — Current State

Snapshot. Update this file whenever something structural changes.

**As of:** 2026-09-30

---

## Live numbers

- **Published items:** 114 (highest id `aw-0125`)
- **Pending, curated and awaiting approval:** 10
- **Site:** live at americawhat.com, deploying cleanly from `main`

### Category distribution (published)

| category | items |
|---|---|
| florida-man | 41 |
| hoa-housing | 23 |
| crime-weird | 21 |
| bureaucracy | 10 |
| only-in-america | 10 |
| food-crime | 5 |
| fine-print | 4 |

`florida-man` is 36% of the feed. `food-crime` and `fine-print` are thin — favour
them when a legitimate candidate appears.

### Field coverage (published)

- `city` present: 53 / 114
- `state` present: 64 / 114

The gap is historical: `city`/`state` were only added to the workflow partway
through. Everything curated from that point on carries them.

## Pipeline configuration

- **Sources:** `src/data/sources.json` — seven Google News RSS queries, one per
  category, each with a `defaultCategory`.
- **Filters:** `src/data/filters.json` — `minScore: 3`, `recencyDays: 21`,
  `maxPerSource: 12`, plus a keyword→score map (`hoa` 5, `fined` 5, `dmv` 5,
  `loophole` 5, `bizarre` 5, `ordinance` 1, …).
- **Fetch cron:** 02:00, 14:00, 20:00 UTC daily.
- **Typical batch size on arrival:** 80–190 candidates, of which 40–60% are
  duplicate syndications of a handful of stories.

## What has been done

- Astro site, 7 categories, client-side category filtering
- Item detail pages with slugs, Article JSON-LD, RSS feed, XML sitemap
- Per-item OG image generation at build (Python/Pillow)
- Reaction system (WAT / LOL / SAME / DEAD) + view beacon on PHP/JSON endpoints
- GitOps admin panel at `/boss/` committing through the GitHub Contents API
- Automated candidate fetching with keyword scoring and a `seen_ids` dedup ledger
- Legal pages: privacy, terms, disclaimer, guidelines, about, contact
- Editorial standard settled: two-sentence comment, `status: REAL`, `city`/`state`
  filled from the source, hard-reject list for harmful content
- Privacy page "Visit logs" clause trimmed from a four-line technical inventory to
  one line (retention + no ad profiles)

## Known gaps / backlog

1. **No syndication filter in the fetcher.** The single biggest cost. One wire
   story arrives up to 71 times. `scripts/fetch-sources.mjs` should canonicalize
   and collapse by normalized title or resolved URL before writing `pending.json`.
2. **`source_url` left empty by the fetcher.** It writes the link to
   `external_url` instead, so every curated item needs a manual copy or the card
   renders "unverified". Fix at the source in `fetch-sources.mjs`.
3. **61 published items missing `city`/`state`.** Backfillable from their source
   links; purely cosmetic (the detail page just omits the place line).
4. **Foreign noise in the source queries.** The Google News RSS queries are not
   geo-restricted, so UK/India/Nepal/Australia/Canada "man fined" stories flood
   in. Adding a country filter or a domain blocklist to `filters.json` would cut
   a large share of manual rejections.
5. **Category imbalance.** `fine-print` (4) and `food-crime` (5) need dedicated
   sources; the current queries rarely surface them.
6. **Contact form.** `src/pages/contact.astro` posts to Formspree; verify the
   endpoint is wired before relying on submissions.
7. **No automated tests or link checking.** Dead `source_url`s would fail silently.

## Planned next steps

- Dedup in `fetch-sources.mjs` (item 1) — highest leverage change available
- Populate `source_url` at fetch time (item 2)
- Backfill `city`/`state` on older published items (item 3)
- Geo/domain filtering in `filters.json` (item 4)
- Add `fine-print` and `food-crime` specific RSS queries (item 5)

## Working history

Content curation has run in batches, each one: fetch produces N candidates →
group by title → read the sources → keep 5–10 → fill fields → push → approve in
the panel. Recent batches: 16 → 5, 90 → 10, 42 → 2, 66 → 10, 81 → 10, 121 → 8,
108 → 10, 142 → 6, 190 → 10, 89 → 10.

Two older digest files sit at the repo root (`digest-2026-08-14.md`,
`digest-2026-09-18.md`) and are point-in-time notes, superseded by this folder.
