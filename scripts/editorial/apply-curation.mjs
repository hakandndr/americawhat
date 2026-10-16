#!/usr/bin/env node
// Applies a curation file to the CURRENT src/data/pending.json without
// touching candidates it does not name. Replaces the old "rewrite pending.json
// to the keepers, then pull -X ours" routine, which silently dropped any
// candidate the fetch workflow added in the meantime.
//
//   node scripts/editorial/apply-curation.mjs curation.json [--check]
//
// curation.json:
//   {
//     "keep": [ { "id": "aw-p-…", "comment": "…", "city": "…", "state": "…",
//                 "category": "…", "source_url": "https://…", "status": "REAL" } ],
//     "drop": [ "aw-p-…", … ],
//     "propose_reject": [ { "id": "aw-p-…", "reason": "NOT_US", "note": "…" } ]
//   }
// propose_reject only records draft_reason / draft_note on the candidate:
// Boss preselects Reject with that reason, and the owner's submission makes
// the decision (logged in Boss → Audit). Nothing is removed here.
// Kept items get the given fields; dropped items leave pending (they stay in
// seen_ids.json, so the fetcher does not bring them back); every other
// candidate is left exactly as it is. --check validates without writing.

import fs from 'node:fs';
import { CATEGORIES, countSentences, isOriginalSourceUrl, REJECTION_REASONS } from '../../workers/shared/editorial-signals.mjs';

const EDITABLE = ['title', 'comment', 'city', 'state', 'category', 'source_url', 'source_name', 'status', 'date'];

export function applyCuration(pending, curation) {
  const errors = [];
  const warnings = [];
  const byId = new Map(pending.map((p) => [p.id, p]));
  for (const k of curation.keep || []) {
    const item = byId.get(k.id);
    if (!item) { errors.push(`keep: ${k.id} is not in pending (already approved or dropped?)`); continue; }
    if (k.comment != null && countSentences(k.comment) !== 2) errors.push(`keep: ${k.id} comment is not two sentences`);
    if (k.category != null && !CATEGORIES.includes(k.category)) errors.push(`keep: ${k.id} unknown category ${k.category}`);
    if (k.source_url != null && !isOriginalSourceUrl(k.source_url)) warnings.push(`keep: ${k.id} source_url is not an original article URL`);
  }
  for (const id of curation.drop || []) if (!byId.has(id)) warnings.push(`drop: ${id} is not in pending (nothing to do)`);
  for (const r of curation.propose_reject || []) {
    if (!byId.has(r.id)) warnings.push(`propose_reject: ${r.id} is not in pending (nothing to do)`);
    if (!REJECTION_REASONS[r.reason]) errors.push(`propose_reject: ${r.id} unknown reason ${r.reason}`);
  }
  const keepIds = new Set((curation.keep || []).map((k) => k.id));
  for (const r of curation.propose_reject || []) if (keepIds.has(r.id)) errors.push(`${r.id} is both kept and proposed for rejection`);
  for (const id of curation.drop || []) if (keepIds.has(id)) errors.push(`${id} is both kept and dropped`);
  if (errors.length) return { ok: false, errors, warnings };

  const updates = new Map((curation.keep || []).map((k) => [k.id, k]));
  const drop = new Set(curation.drop || []);
  const proposals = new Map((curation.propose_reject || []).filter((r) => byId.has(r.id)).map((r) => [r.id, r]));
  const next = [];
  for (const item of pending) {
    if (drop.has(item.id)) continue;
    const u = updates.get(item.id);
    const r = proposals.get(item.id);
    if (!u && !r) { next.push(item); continue; }
    const merged = { ...item };
    if (u) for (const key of EDITABLE) if (u[key] != null) merged[key] = String(u[key]);
    if (r) { merged.draft_reason = r.reason; merged.draft_note = String(r.note || '').slice(0, 300); }
    next.push(merged);
  }
  return { ok: true, pending: next, kept: updates.size, proposed: proposals.size, dropped: pending.length - next.length, untouched: next.length - updates.size - proposals.size, errors, warnings };
}

if (process.argv[1] && process.argv[1].endsWith('apply-curation.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: apply-curation.mjs curation.json [--check]'); process.exit(2); }
  const path = 'src/data/pending.json';
  const pending = JSON.parse(fs.readFileSync(path, 'utf8'));
  const result = applyCuration(pending, JSON.parse(fs.readFileSync(file, 'utf8')));
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (!result.ok) { for (const e of result.errors) console.error(`error: ${e}`); process.exit(1); }
  console.log(`kept ${result.kept}, proposed for rejection ${result.proposed}, dropped ${result.dropped}, untouched ${result.untouched}`);
  if (!process.argv.includes('--check')) fs.writeFileSync(path, `${JSON.stringify(result.pending, null, 2)}\n`);
}
