// Legacy Hostinger panel-log import (aw_panel_log.txt, one JSON object per line).
//
// Deterministic and idempotent:
// - A line's identity is the one DNDR already uses for this log:
//     panel_log:<first 32 hex of sha256(PHP-trimmed line)>.<occurrence>
//   where <occurrence> counts identical lines earlier in the same file (0 for
//   the first). An append-only log keeps every identity stable across later,
//   longer snapshots, so a delta import is "the same file again".
// - Every line gets exactly one disposition: imported, already_present,
//   missing_page, malformed or invalid_time. Nothing is guessed: a missing
//   field stays empty, a line without a page is kept in the ledger only.
// - Lines older than an applied Delete Before Date cutoff, or imported once
//   and since deleted, are never inserted again (privacy over completeness).
// - Times were written by PHP as America/Los_Angeles wall clock with no offset
//   ('Y-m-d h:i:s A'). A wall time in the repeated fall-back hour has two
//   possible instants. When the previous line's instant rules the earlier one
//   out (the log is append-only) the later one is used (dst_ambiguous_ordered);
//   otherwise the earlier one, flagged dst_ambiguous_first. A wall time in
//   the skipped spring-forward hour cannot have been written by PHP and is
//   recorded as invalid_time.
// Runs in Workers and in Node (WebCrypto only).

import { automationFromLegacyLabel, classifyAgent, normalizePage, osFamily, splitDevice } from './classify.mjs';
import { sha256Hex } from './http.mjs';
import { OWNER_TZ, wallTimeToInstants } from './time.mjs';

export const SOURCE_SYSTEM = 'americawhat_panel_log';
export const PARSER_VERSION = 'aw-panel-log/1';
const WALL = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)$/;

/** PHP trim(): space, \t, \n, \r, \0, \x0B at both ends. */
export function phpTrim(value) {
  return String(value).replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
}

export function parseWallTime(text) {
  const m = WALL.exec(String(text ?? '').trim());
  if (!m) return null;
  let hour = Number(m[2]);
  const minute = Number(m[3]);
  const second = Number(m[4]);
  if (hour < 1 || hour > 12 || minute > 59 || second > 59) return null;
  if (m[5] === 'AM') hour = hour === 12 ? 0 : hour;
  else hour = hour === 12 ? 12 : hour + 12;
  return { day: m[1], hour, minute, second };
}

/** Resolves a wall time to { instant, quality } or { error }. */
export function resolveInstant(wall, previousInstant) {
  const instants = wallTimeToInstants(wall.day, wall.hour, wall.minute, wall.second);
  if (instants.length === 0) return { error: 'nonexistent_local_time' };
  if (instants.length === 1) return { instant: instants[0], quality: 'exact' };
  // Log order is evidence only when it rules the earlier instant out.
  if (previousInstant != null && instants[0] < previousInstant && instants[1] >= previousInstant) {
    return { instant: instants[1], quality: 'dst_ambiguous_ordered' };
  }
  return { instant: instants[0], quality: 'dst_ambiguous_first' };
}

function str(value, max = 2048) {
  return value == null ? '' : String(value).slice(0, max);
}

/**
 * Parses a whole corpus into a plan. No database access.
 * Returns { sha256, lineCount, records: [{ lineNo, recordId, disposition, row?, detail }], summary }.
 */
export async function planCorpus(text, { receivedAt = 0 } = {}) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  const sha256 = await sha256Hex(normalized);
  const lines = normalized.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const seen = new Map();
  const records = [];
  let previous = null;
  let first = null;
  let last = null;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = phpTrim(lines[i]);
    const hash = (await sha256Hex(trimmed)).slice(0, 32);
    const occurrence = seen.get(hash) ?? 0;
    seen.set(hash, occurrence + 1);
    const recordId = `panel_log:${hash}.${occurrence}`;
    if (trimmed === '') { records.push({ lineNo, recordId, disposition: 'malformed', detail: 'empty_line' }); continue; }
    let entry;
    try { entry = JSON.parse(trimmed); } catch { entry = null; }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { records.push({ lineNo, recordId, disposition: 'malformed', detail: 'not_json_object' }); continue; }
    const wall = parseWallTime(entry.date);
    if (!wall) { records.push({ lineNo, recordId, disposition: 'malformed', detail: 'bad_date' }); continue; }
    const resolved = resolveInstant(wall, previous);
    if (resolved.error) { records.push({ lineNo, recordId, disposition: 'invalid_time', detail: resolved.error }); continue; }
    previous = resolved.instant;
    first = first == null ? resolved.instant : Math.min(first, resolved.instant);
    last = last == null ? resolved.instant : Math.max(last, resolved.instant);
    const path = str(entry.path, 512).trim();
    if (path === '' || path === '-') { records.push({ lineNo, recordId, disposition: 'missing_page', detail: 'no_path' }); continue; }
    const ua = str(entry.ua_full, 1024);
    const sourceLabel = str(entry.source, 80);
    const device = str(entry.device, 80);
    const { deviceClass, browser } = splitDevice(device);
    records.push({
      lineNo,
      recordId,
      disposition: 'imported',
      detail: resolved.quality === 'exact' ? '' : resolved.quality,
      row: {
        event_uid: recordId,
        origin: 'legacy',
        occurred_at: resolved.instant,
        la_day: wall.day,
        time_quality: resolved.quality,
        received_at: receivedAt,
        ip: str(entry.ip, 64),
        country: str(entry.country, 80),
        country_code: '',
        region: '',
        city: str(entry.city, 160),
        path,
        page: normalizePage(path),
        referrer: str(entry.referrer, 256) || 'Direct',
        referrer_raw: str(entry.referrer_raw, 1024),
        user_agent: ua,
        source_label: sourceLabel,
        device,
        device_class: deviceClass,
        browser,
        os: ua ? osFamily(ua) : '',
        agent: ua ? classifyAgent(ua).agent : '',
        automation: automationFromLegacyLabel(sourceLabel),
      },
    });
  }
  const summary = { lines: records.length };
  for (const r of records) summary[r.disposition] = (summary[r.disposition] || 0) + 1;
  summary.dst_ambiguous = records.filter((r) => r.row && r.row.time_quality !== 'exact').length;
  return { sha256, lineCount: records.length, firstAt: first, lastAt: last, records, summary };
}

const EVENT_COLUMNS = ['event_uid', 'origin', 'occurred_at', 'la_day', 'time_quality', 'received_at', 'ip', 'country',
  'country_code', 'region', 'city', 'path', 'page', 'referrer', 'referrer_raw', 'user_agent', 'source_label', 'device',
  'device_class', 'browser', 'os', 'agent', 'automation', 'import_corpus_id', 'import_record_id'];

export function corpusIdFor(sha256) {
  return `corp_${sha256.slice(0, 24)}`;
}

/**
 * Applies a plan to ANALYTICS_DB. Safe to re-run at any point: the corpus,
 * every ledger row and every event are written with INSERT OR IGNORE keyed by
 * their identities, so a partial or repeated run never duplicates anything.
 * Lines whose identity is already stored (from an earlier snapshot) are
 * recorded as already_present. Returns a reconciliation report.
 */
export async function applyPlan(db, plan, { actor, now, chunkSize = 40 }) {
  const corpusId = corpusIdFor(plan.sha256);
  const existing = await db.prepare('SELECT corpus_id FROM analytics_import_corpora WHERE content_sha256 = ?').bind(plan.sha256).first();
  const importable = plan.records.filter((r) => r.disposition === 'imported');

  // Identities stored by an earlier corpus: still present, or imported once and
  // later removed by a Delete Before Date. Neither is inserted again.
  const present = new Set();
  for (let i = 0; i < importable.length; i += 80) {
    const ids = importable.slice(i, i + 80).map((r) => r.recordId);
    const marks = ids.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT event_uid FROM visitor_events WHERE event_uid IN (${marks}) AND COALESCE(import_corpus_id, '') <> ?
       UNION SELECT record_id FROM analytics_import_records
        WHERE record_id IN (${marks}) AND corpus_id <> ? AND disposition IN ('imported', 'already_present')`,
    ).bind(...ids, corpusId, ...ids, corpusId).all();
    for (const row of results) present.add(row.event_uid);
  }
  // Raw rows older than an applied retention cutoff are never brought back.
  const floorRow = await db.prepare(
    "SELECT MAX(cutoff_at) AS floor FROM analytics_operator_log WHERE action = 'delete_before'",
  ).first();
  const retentionFloor = floorRow && floorRow.floor != null ? Number(floorRow.floor) : null;

  await db.prepare(
    `INSERT OR IGNORE INTO analytics_import_corpora
       (corpus_id, content_sha256, source_system, parser_version, time_zone, line_count, first_record_at, last_record_at, imported_at, actor, summary_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(corpusId, plan.sha256, SOURCE_SYSTEM, PARSER_VERSION, OWNER_TZ, plan.lineCount, plan.firstAt, plan.lastAt, now, actor,
    JSON.stringify(plan.summary)).run();

  for (let i = 0; i < plan.records.length; i += chunkSize) {
    const statements = [];
    for (const r of plan.records.slice(i, i + chunkSize)) {
      let disposition = r.disposition;
      if (disposition === 'imported' && present.has(r.recordId)) disposition = 'already_present';
      if (disposition === 'imported' && retentionFloor != null && r.row.occurred_at < retentionFloor) disposition = 'before_retention_cutoff';
      if (disposition === 'imported') {
        const row = { ...r.row, received_at: now, import_corpus_id: corpusId, import_record_id: r.recordId };
        statements.push(db.prepare(
          `INSERT OR IGNORE INTO visitor_events (${EVENT_COLUMNS.join(', ')}) VALUES (${EVENT_COLUMNS.map(() => '?').join(', ')})`,
        ).bind(...EVENT_COLUMNS.map((c) => row[c] ?? '')));
      }
      statements.push(db.prepare(
        `INSERT OR IGNORE INTO analytics_import_records (corpus_id, line_no, record_id, disposition, event_uid, detail)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(corpusId, r.lineNo, r.recordId, disposition, disposition === 'imported' || disposition === 'already_present' ? r.recordId : null, r.detail || ''));
    }
    await db.batch(statements);
  }

  if (!existing && plan.firstAt != null) {
    await db.prepare(
      `INSERT INTO analytics_coverage (kind, started_at, ended_at, note, created_at) VALUES ('legacy_corpus', ?, ?, ?, ?)`,
    ).bind(plan.firstAt, plan.lastAt, `${corpusId} ${plan.lineCount} lines`, now).run();
  }
  return reconcile(db, plan);
}

/** Ledger and event counts for one corpus, with the invariants checked. */
export async function reconcile(db, plan) {
  const corpusId = corpusIdFor(plan.sha256);
  const { results } = await db.prepare(
    'SELECT disposition, COUNT(*) AS n FROM analytics_import_records WHERE corpus_id = ? GROUP BY disposition',
  ).bind(corpusId).all();
  const ledger = {};
  let ledgerTotal = 0;
  for (const row of results) { ledger[row.disposition] = Number(row.n); ledgerTotal += Number(row.n); }
  const events = await db.prepare('SELECT COUNT(*) AS n FROM visitor_events WHERE import_corpus_id = ?').bind(corpusId).first();
  const expectedImportable = plan.records.filter((r) => r.disposition === 'imported').length;
  const heldBack = ledger.before_retention_cutoff || 0;
  const storedForCorpus = Number(events.n);
  const accounted = (ledger.imported || 0) + (ledger.already_present || 0);
  return {
    corpusId,
    sha256: plan.sha256,
    lines: plan.lineCount,
    ledgerTotal,
    ledger,
    eventsFromThisCorpus: storedForCorpus,
    checks: {
      everyLineHasOneDisposition: ledgerTotal === plan.lineCount,
      importableAccounted: accounted + heldBack === expectedImportable,
      eventsMatchLedger: storedForCorpus === (ledger.imported || 0),
    },
  };
}

/** Per-LA-day page-view counts of a plan's importable lines (for comparison with DNDR or the old panel). */
export function dailyCounts(plan) {
  const out = {};
  for (const r of plan.records) if (r.disposition === 'imported') out[r.row.la_day] = (out[r.row.la_day] || 0) + 1;
  return out;
}
