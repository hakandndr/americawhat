// Import of the Hostinger reaction store (analytics/aw_votes.json) into APP_DB.
//
// Model:
//   S1 (baseline)  taken just before the Cloudflare hostname is attached;
//                  its counts are ADDED to reaction_counts (normally empty).
//   S2, S3 (delta) taken later from Hostinger while stale DNS still reaches it;
//                  each adds (Sn - Sn-1) per key. A negative difference means
//                  Hostinger lost or reset votes: the import is refused.
// Each snapshot is applied at most once (unique SHA-256 in reaction_imports),
// and the import row and every count change are one D1 batch, so a failure
// or a repeat changes nothing. Votes cast on Cloudflare in the meantime are
// never overwritten because imports only ever add.

import { REACTIONS } from '../web/src/reactions.mjs';
import { sha256Hex } from './http.mjs';

const ID_PATTERN = /^aw-[a-z0-9-]{1,40}$/i;

/**
 * Parses aw_votes.json text. Returns { ok, snapshot, errors }.
 * snapshot = { "aw-0001": { wat, lol, same, dead }, ... } with every key kept,
 * including ids that are no longer published (their counts are preserved).
 */
export function parseVotesSnapshot(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, errors: ['not_json'] }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['not_an_object'] };
  const errors = [];
  const snapshot = {};
  for (const [id, counts] of Object.entries(data)) {
    if (!ID_PATTERN.test(id)) { errors.push(`bad_id:${id.slice(0, 50)}`); continue; }
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) { errors.push(`bad_counts:${id}`); continue; }
    const row = {};
    for (const reaction of REACTIONS) {
      const n = counts[reaction] ?? 0;
      if (!Number.isInteger(n) || n < 0) { errors.push(`bad_value:${id}.${reaction}`); continue; }
      row[reaction] = n;
    }
    for (const key of Object.keys(counts)) if (!REACTIONS.includes(key)) errors.push(`unknown_reaction:${id}.${key}`);
    snapshot[id] = row;
  }
  return { ok: errors.length === 0, snapshot, errors };
}

export function snapshotTotal(snapshot) {
  let total = 0;
  for (const row of Object.values(snapshot)) for (const r of REACTIONS) total += row[r] || 0;
  return total;
}

/** Per-key additions from `previous` to `current`; refuses decreases. */
export function diffSnapshots(previous, current) {
  const additions = [];
  const decreases = [];
  for (const [id, row] of Object.entries(current)) {
    for (const r of REACTIONS) {
      const before = previous?.[id]?.[r] || 0;
      const after = row[r] || 0;
      if (after > before) additions.push({ itemId: id, reaction: r, add: after - before });
      if (after < before) decreases.push({ itemId: id, reaction: r, before, after });
    }
  }
  for (const [id, row] of Object.entries(previous || {})) {
    if (!(id in current)) for (const r of REACTIONS) if ((row[r] || 0) > 0) decreases.push({ itemId: id, reaction: r, before: row[r], after: 0 });
  }
  return { additions, decreases };
}

/**
 * Plans an import of `text` against the current import history.
 * Returns { ok, kind, sha256, additions, votesAdded, previousSha256, errors }.
 */
export async function planReactionImport(db, text) {
  const parsed = parseVotesSnapshot(text);
  const sha256 = await sha256Hex(text);
  if (!parsed.ok) return { ok: false, sha256, errors: parsed.errors };
  const dup = await db.prepare('SELECT import_id FROM reaction_imports WHERE source_sha256 = ?').bind(sha256).first();
  if (dup) return { ok: false, sha256, errors: ['already_imported'] };
  const last = await db.prepare(
    'SELECT source_sha256, snapshot_json FROM reaction_imports ORDER BY imported_at DESC, rowid DESC LIMIT 1',
  ).first();
  const kind = last ? 'delta' : 'baseline';
  const previous = last ? JSON.parse(last.snapshot_json) : {};
  const { additions, decreases } = diffSnapshots(previous, parsed.snapshot);
  if (decreases.length) return { ok: false, sha256, kind, errors: decreases.map((d) => `decrease:${d.itemId}.${d.reaction}:${d.before}->${d.after}`) };
  return {
    ok: true,
    kind,
    sha256,
    previousSha256: last ? last.source_sha256 : null,
    snapshot: parsed.snapshot,
    keys: Object.keys(parsed.snapshot).length,
    additions,
    votesAdded: additions.reduce((s, a) => s + a.add, 0),
    snapshotTotal: snapshotTotal(parsed.snapshot),
  };
}

/** Applies a plan in one atomic batch. */
export async function applyReactionImport(db, plan, { actor, now, note = '' }) {
  if (!plan.ok) throw new Error(`refusing a plan with errors: ${plan.errors.join(', ')}`);
  const importId = `rimp_${plan.sha256.slice(0, 16)}`;
  const statements = [
    db.prepare(
      `INSERT INTO reaction_imports (import_id, kind, source_sha256, previous_sha256, keys_count, votes_added, snapshot_json, imported_at, actor, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(importId, plan.kind, plan.sha256, plan.previousSha256, plan.keys, plan.votesAdded, JSON.stringify(plan.snapshot), now, actor, note),
  ];
  for (const a of plan.additions) {
    statements.push(db.prepare(
      `INSERT INTO reaction_counts (item_id, reaction, count, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (item_id, reaction) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
    ).bind(a.itemId, a.reaction, a.add, now));
  }
  await db.batch(statements);
  return { importId, kind: plan.kind, votesAdded: plan.votesAdded };
}

/** The current counts in aw_votes.json shape (for a rollback to Hostinger). */
export async function exportVotesJson(db) {
  const { results } = await db.prepare('SELECT item_id, reaction, count FROM reaction_counts ORDER BY item_id, reaction').all();
  const out = {};
  for (const row of results) {
    out[row.item_id] ??= { wat: 0, lol: 0, same: 0, dead: 0 };
    out[row.item_id][row.reaction] = Number(row.count);
  }
  return out;
}
