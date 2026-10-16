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
//     "drop": [ "aw-p-…", … ]
//   }
// Kept items get the given fields; dropped items leave pending (they stay in
// seen_ids.json, so the fetcher does not bring them back); every other
// candidate is left exactly as it is. --check validates without writing.

import fs from 'node:fs';
import { CATEGORIES, countSentences, isOriginalSourceUrl } from '../../workers/shared/editorial-signals.mjs';

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
  const keepIds = new Set((curation.keep || []).map((k) => k.id));
  for (const id of curation.drop || []) if (keepIds.has(id)) errors.push(`${id} is both kept and dropped`);
  if (errors.length) return { ok: false, errors, warnings };

  const updates = new Map((curation.keep || []).map((k) => [k.id, k]));
  const drop = new Set(curation.drop || []);
  const next = [];
  for (const item of pending) {
    if (drop.has(item.id)) continue;
    const u = updates.get(item.id);
    if (!u) { next.push(item); continue; }
    const merged = { ...item };
    for (const key of EDITABLE) if (u[key] != null) merged[key] = String(u[key]);
    next.push(merged);
  }
  return { ok: true, pending: next, kept: updates.size, dropped: pending.length - next.length, untouched: next.length - updates.size, errors, warnings };
}

if (process.argv[1] && process.argv[1].endsWith('apply-curation.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: apply-curation.mjs curation.json [--check]'); process.exit(2); }
  const path = 'src/data/pending.json';
  const pending = JSON.parse(fs.readFileSync(path, 'utf8'));
  const result = applyCuration(pending, JSON.parse(fs.readFileSync(file, 'utf8')));
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (!result.ok) { for (const e of result.errors) console.error(`error: ${e}`); process.exit(1); }
  console.log(`kept ${result.kept}, dropped ${result.dropped}, untouched ${result.untouched}`);
  if (!process.argv.includes('--check')) fs.writeFileSync(path, `${JSON.stringify(result.pending, null, 2)}\n`);
}
