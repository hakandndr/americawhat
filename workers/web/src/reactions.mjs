// Reactions (WAT / LOL / SAME / DEAD) on published items.
//
// - Writes are POST only. Item ids must belong to the published set bundled
//   with this deployment; reaction keys must be one of the four.
// - An increment is one D1 batch: a per-address hourly rate bucket, a
//   per-(address, item, reaction, LA day) guard, then the UPSERT that counts
//   only when the guard row was newly inserted. The batch is atomic, so a
//   failure counts nothing and a retry cannot double count.
// - Addresses are never stored: guard and rate keys are HMACs under a secret.

import { hmacHex } from '../../shared/http.mjs';
import { laDay } from '../../shared/time.mjs';

export const REACTIONS = Object.freeze(['wat', 'lol', 'same', 'dead']);
export const RATE_LIMIT_PER_HOUR = 30;
export const GUARD_TTL_SECONDS = 2 * 86400;
const ID_PATTERN = /^aw-[a-z0-9-]{1,40}$/i;
const MAX_IDS_PER_READ = 200;

export function emptyCounts() {
  return { wat: 0, lol: 0, same: 0, dead: 0 };
}

export function isWellFormedId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/** Parses the `ids` query value: comma separated, well-formed, de-duplicated, capped. */
export function parseIds(raw) {
  const out = [];
  for (const part of String(raw ?? '').split(',')) {
    const id = part.trim();
    if (isWellFormedId(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_IDS_PER_READ) break;
  }
  return out;
}

/** { id: {wat, lol, same, dead} } for every requested id (zeros when unknown). */
export async function readCounts(db, ids) {
  const out = {};
  for (const id of ids) out[id] = emptyCounts();
  if (!ids.length) return out;
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT item_id, reaction, count FROM reaction_counts WHERE item_id IN (${placeholders})`,
  ).bind(...ids).all();
  for (const row of results) if (out[row.item_id] && REACTIONS.includes(row.reaction)) out[row.item_id][row.reaction] = Number(row.count);
  return out;
}

/**
 * Validates and records one reaction.
 * Returns { status: 'ok', counted, counts } or { status: 'error', error, http }.
 */
export async function recordReaction(db, { itemId, reaction, ip, secret, publishedIds, now }) {
  if (!secret) return { status: 'error', error: 'not_configured', http: 503 };
  if (!isWellFormedId(itemId)) return { status: 'error', error: 'bad_id', http: 400 };
  if (!publishedIds.has(itemId)) return { status: 'error', error: 'unknown_item', http: 404 };
  if (!REACTIONS.includes(reaction)) return { status: 'error', error: 'bad_reaction', http: 400 };

  const address = String(ip || 'unknown');
  const hourStart = now - (now % 3600);
  const rateKey = await hmacHex(secret, `rate|${address}|${hourStart}`);
  const guardKey = await hmacHex(secret, `guard|${address}|${itemId}|${reaction}|${laDay(now)}`);

  const results = await db.batch([
    db.prepare('DELETE FROM reaction_rate WHERE window_end < ?').bind(now),
    db.prepare('DELETE FROM reaction_guard WHERE created_at < ?').bind(now - GUARD_TTL_SECONDS),
    db.prepare(
      `INSERT INTO reaction_rate (bucket_key, hits, window_end) VALUES (?, 1, ?)
       ON CONFLICT (bucket_key) DO UPDATE SET hits = hits + 1`,
    ).bind(rateKey, hourStart + 3600),
    db.prepare(
      `INSERT OR IGNORE INTO reaction_guard (guard_key, created_at)
       SELECT ?, ? WHERE (SELECT hits FROM reaction_rate WHERE bucket_key = ?) <= ?`,
    ).bind(guardKey, now, rateKey, RATE_LIMIT_PER_HOUR),
    db.prepare(
      `INSERT INTO reaction_counts (item_id, reaction, count, updated_at)
       SELECT ?, ?, 1, ? WHERE changes() = 1
       ON CONFLICT (item_id, reaction) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
    ).bind(itemId, reaction, now),
  ]);
  const counted = Number(results[4]?.meta?.changes || 0) === 1;
  const counts = (await readCounts(db, [itemId]))[itemId];
  return { status: 'ok', counted, counts };
}
