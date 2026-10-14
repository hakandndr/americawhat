// Boss Analytics queries over ANALYTICS_DB. Every value is bound; filter text
// is matched literally (% and _ escaped). The module receives only the
// analytics database handle.
//
// Metric definitions (see docs/ANALYTICS.md):
//   ALL #      visitor_events.id — durable, never renumbered; deletions leave gaps
//   TODAY #    position of the row among all rows of its LA day, in id order
//   IP VISITS  retained page_view rows with exactly that address, all time
//   Addresses  distinct address strings in the view — not people

import { daysBefore, isDay, laDay, laDayBounds, laMidnight, nextDay } from '../../shared/time.mjs';

export const RETENTION_DAYS = 90;
const LIMITS = [25, 50, 100];

function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Validated filters from a URL's query string. Unknown values are dropped. */
export function parseFilters(params, now) {
  const today = laDay(now);
  const f = { range: 'all', from: '', to: '', origin: '', cls: '', device: '', ip: '', country: '', place: '', page: '', referrer: '', browser: '', limit: 50, before: null };
  const get = (k) => String(params.get(k) ?? '').trim();
  if (['today', '7d', '30d', 'all', 'custom'].includes(get('range'))) f.range = get('range');
  if (isDay(get('from'))) f.from = get('from');
  if (isDay(get('to'))) f.to = get('to');
  if (f.from || f.to) f.range = 'custom';
  if (['legacy', 'native'].includes(get('origin'))) f.origin = get('origin');
  if (['human', 'automated'].includes(get('class'))) f.cls = get('class');
  if (['mobile', 'desktop', 'unknown'].includes(get('device'))) f.device = get('device');
  for (const k of ['ip', 'country', 'place', 'page', 'referrer', 'browser']) f[k] = get(k).slice(0, 200);
  const limit = Number(get('limit'));
  if (LIMITS.includes(limit)) f.limit = limit;
  const before = Number(get('before'));
  if (Number.isInteger(before) && before > 0) f.before = before;
  f.today = today;
  return f;
}

/** [start, end) Unix seconds for the filter's range, or nulls for all time. */
export function rangeBounds(f) {
  if (f.range === 'today') { const b = laDayBounds(f.today); return { start: b.start, end: b.end }; }
  if (f.range === '7d') return { start: laMidnight(daysBefore(f.today, 6)), end: laDayBounds(f.today).end };
  if (f.range === '30d') return { start: laMidnight(daysBefore(f.today, 29)), end: laDayBounds(f.today).end };
  if (f.range === 'custom') return { start: f.from ? laMidnight(f.from) : null, end: f.to ? laMidnight(nextDay(f.to)) : null };
  return { start: null, end: null };
}

/** WHERE clause and arguments for the filters (without keyset). */
export function whereFor(f) {
  const clauses = [];
  const args = [];
  const { start, end } = rangeBounds(f);
  if (start != null) { clauses.push('occurred_at >= ?'); args.push(start); }
  if (end != null) { clauses.push('occurred_at < ?'); args.push(end); }
  if (f.origin) { clauses.push('origin = ?'); args.push(f.origin); }
  if (f.cls) { clauses.push('automation = ?'); args.push(f.cls); }
  if (f.device) { clauses.push('device_class = ?'); args.push(f.device); }
  if (f.ip) { clauses.push('ip = ?'); args.push(f.ip); }
  if (f.country) { clauses.push('(lower(country) = lower(?) OR upper(country_code) = upper(?))'); args.push(f.country, f.country); }
  if (f.place) { clauses.push("(city LIKE ? ESCAPE '\\' OR region LIKE ? ESCAPE '\\')"); args.push(`%${escapeLike(f.place)}%`, `%${escapeLike(f.place)}%`); }
  if (f.page) {
    if (f.page.endsWith('*')) { clauses.push("page LIKE ? ESCAPE '\\'"); args.push(`${escapeLike(f.page.slice(0, -1))}%`); }
    else { clauses.push('page = ?'); args.push(f.page); }
  }
  if (f.referrer) { clauses.push("(referrer LIKE ? ESCAPE '\\' OR referrer_raw LIKE ? ESCAPE '\\')"); args.push(`%${escapeLike(f.referrer)}%`, `%${escapeLike(f.referrer)}%`); }
  if (f.browser) { clauses.push("browser LIKE ? ESCAPE '\\'"); args.push(`${escapeLike(f.browser)}%`); }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', args };
}

/** The retained-log line and the summary strip for the current view. */
export async function summary(db, f) {
  const w = whereFor(f);
  const view = await db.prepare(
    `SELECT COUNT(*) AS events,
            SUM(automation = 'human') AS human, SUM(automation = 'automated') AS automated,
            SUM(origin = 'legacy') AS legacy, SUM(origin = 'native') AS native,
            COUNT(DISTINCT ip) AS addresses
       FROM visitor_events ${w.sql}`,
  ).bind(...w.args).first();
  const todayBounds = laDayBounds(f.today);
  const overall = await db.prepare(
    `SELECT COUNT(*) AS retained, MIN(occurred_at) AS oldest, MAX(id) AS last_all_no,
            SUM(occurred_at >= ? AND occurred_at < ?) AS today
       FROM visitor_events`,
  ).bind(todayBounds.start, todayBounds.end).first();
  const archived = await db.prepare('SELECT COALESCE(SUM(page_views), 0) AS n, MIN(la_day) AS first_day FROM analytics_rollup_daily').first();
  const n = (v) => Number(v || 0);
  return {
    view: { events: n(view.events), human: n(view.human), automated: n(view.automated), legacy: n(view.legacy), native: n(view.native), addresses: n(view.addresses) },
    overall: {
      retained: n(overall.retained), today: n(overall.today), oldest: overall.oldest, lastAllNo: overall.last_all_no,
      archivedPageViews: n(archived.n), archivedFirstDay: archived.first_day, allTimePageViews: n(overall.retained) + n(archived.n),
    },
  };
}

/** Top values of `column` (page, country, referrer) in the view. */
export async function top(db, f, column, limit = 10) {
  if (!['page', 'country', 'referrer', 'agent', 'browser'].includes(column)) throw new Error('bad column');
  const w = whereFor(f);
  const { results } = await db.prepare(
    `SELECT ${column} AS value, COUNT(*) AS n FROM visitor_events ${w.sql} GROUP BY ${column} ORDER BY n DESC, value ASC LIMIT ?`,
  ).bind(...w.args, limit).all();
  return results.map((r) => ({ value: r.value, n: Number(r.n) }));
}

/** One page of the raw stream, newest first, keyset on id. */
export async function stream(db, f) {
  const w = whereFor(f);
  const sql = f.before != null ? (w.sql ? `${w.sql} AND id < ?` : 'WHERE id < ?') : w.sql;
  const args = f.before != null ? [...w.args, f.before] : w.args;
  const { results } = await db.prepare(
    `SELECT visitor_events.*,
            (SELECT COUNT(*) FROM visitor_events t WHERE t.la_day = visitor_events.la_day AND t.id <= visitor_events.id) AS today_no
       FROM visitor_events ${sql}
      ORDER BY id DESC LIMIT ?`,
  ).bind(...args, f.limit + 1).all();
  const rows = results.slice(0, f.limit);
  const ips = [...new Set(rows.map((r) => r.ip).filter(Boolean))];
  const visits = new Map();
  for (let i = 0; i < ips.length; i += 90) {
    const chunk = ips.slice(i, i + 90);
    const { results: counts } = await db.prepare(
      `SELECT ip, COUNT(*) AS n FROM visitor_events WHERE event = 'page_view' AND ip IN (${chunk.map(() => '?').join(',')}) GROUP BY ip`,
    ).bind(...chunk).all();
    for (const c of counts) visits.set(c.ip, Number(c.n));
  }
  return {
    rows: rows.map((r) => ({ ...r, today_no: Number(r.today_no), ip_visits: visits.get(r.ip) || 0 })),
    nextBefore: results.length > f.limit ? rows[rows.length - 1].id : null,
  };
}

/** Async iterator over every matching row in ALL # order, in keyset chunks. */
export async function* iterateRows(db, f, { cutoffAt = null, chunk = 500 } = {}) {
  const w = cutoffAt != null ? { sql: 'WHERE occurred_at < ?', args: [cutoffAt] } : whereFor(f);
  let after = 0;
  for (;;) {
    const sql = w.sql ? `${w.sql} AND id > ?` : 'WHERE id > ?';
    const { results } = await db.prepare(`SELECT * FROM visitor_events ${sql} ORDER BY id ASC LIMIT ?`).bind(...w.args, after, chunk).all();
    for (const r of results) yield r;
    if (results.length < chunk) return;
    after = results[results.length - 1].id;
  }
}

/** Retention status: how much raw data is past the 90-day target. */
export async function retentionStatus(db, now) {
  const today = laDay(now);
  const cutoffDay = daysBefore(today, RETENTION_DAYS);
  const cutoffAt = laMidnight(cutoffDay);
  const row = await db.prepare(
    'SELECT COUNT(*) AS overdue, MIN(occurred_at) AS oldest FROM visitor_events WHERE occurred_at < ?',
  ).bind(cutoffAt).first();
  const oldest = await db.prepare('SELECT MIN(occurred_at) AS oldest FROM visitor_events').first();
  const lastDelete = await db.prepare(
    "SELECT at, cutoff_day, record_count FROM analytics_operator_log WHERE action = 'delete_before' ORDER BY id DESC LIMIT 1",
  ).first();
  const oldestAgeDays = oldest.oldest != null ? Math.floor((now - oldest.oldest) / 86400) : null;
  return {
    targetDays: RETENTION_DAYS,
    suggestedCutoffDay: cutoffDay,
    overdueRecords: Number(row.overdue || 0),
    oldestAt: oldest.oldest,
    oldestAgeDays,
    overdue: Number(row.overdue || 0) > 0,
    lastDelete,
  };
}

/** Exact preview of a Delete Before Date (strictly before 00:00 PT of `cutoffDay`). */
export async function previewDelete(db, cutoffDay) {
  if (!isDay(cutoffDay)) return { ok: false, error: 'bad_date' };
  const cutoffAt = laMidnight(cutoffDay);
  const affected = await db.prepare(
    'SELECT COUNT(*) AS n, MIN(occurred_at) AS oldest, MAX(occurred_at) AS newest, MIN(id) AS first_no, MAX(id) AS last_no FROM visitor_events WHERE occurred_at < ?',
  ).bind(cutoffAt).first();
  const kept = await db.prepare('SELECT COUNT(*) AS n, MIN(occurred_at) AS oldest FROM visitor_events WHERE occurred_at >= ?').bind(cutoffAt).first();
  return {
    ok: true,
    cutoffDay,
    cutoffAt,
    count: Number(affected.n || 0),
    oldest: affected.oldest,
    newest: affected.newest,
    firstNo: affected.first_no,
    lastNo: affected.last_no,
    kept: Number(kept.n || 0),
    oldestKept: kept.oldest,
  };
}

/**
 * Deletes rows strictly before 00:00 PT on `cutoffDay`, in ONE batch:
 *   1. the audit row is inserted only if the live count still equals the
 *      previewed count (and is > 0);
 *   2. non-identifying aggregates of those rows are added to the rollups;
 *   3. their outbox rows and the rows themselves are deleted;
 * every step after 1 runs only if that audit row exists. A stale preview
 * deletes nothing; nothing is deleted without an audit row.
 */
export async function deleteBefore(db, { cutoffDay, expectedCount, actor, opId, now }) {
  if (!isDay(cutoffDay)) return { ok: false, error: 'bad_date' };
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) return { ok: false, error: 'bad_count' };
  if (!/^op_[0-9a-f-]{8,}$/.test(String(opId))) return { ok: false, error: 'bad_op' };
  const cutoffAt = laMidnight(cutoffDay);
  const guard = 'EXISTS (SELECT 1 FROM analytics_operator_log WHERE op_id = ?)';
  const results = await db.batch([
    db.prepare(
      `INSERT INTO analytics_operator_log (op_id, at, actor, action, cutoff_day, cutoff_at, record_count, oldest_at, newest_at, detail)
       SELECT ?, ?, ?, 'delete_before', ?, ?, COUNT(*), MIN(occurred_at), MAX(occurred_at), 'raw records deleted; daily and monthly aggregates kept'
         FROM visitor_events WHERE occurred_at < ? HAVING COUNT(*) = ? AND COUNT(*) > 0`,
    ).bind(opId, now, actor, cutoffDay, cutoffAt, cutoffAt, expectedCount),
    db.prepare(
      `INSERT INTO analytics_rollup_daily (la_day, origin, automation, page_views)
       SELECT la_day, origin, automation, COUNT(*) FROM visitor_events
        WHERE occurred_at < ? AND event = 'page_view' AND ${guard} GROUP BY la_day, origin, automation
       ON CONFLICT (la_day, origin, automation) DO UPDATE SET page_views = page_views + excluded.page_views`,
    ).bind(cutoffAt, opId),
    db.prepare(
      `INSERT INTO analytics_rollup_monthly_page (la_month, page, page_views)
       SELECT substr(la_day, 1, 7), page, COUNT(*) FROM visitor_events
        WHERE occurred_at < ? AND event = 'page_view' AND ${guard} GROUP BY substr(la_day, 1, 7), page
       ON CONFLICT (la_month, page) DO UPDATE SET page_views = page_views + excluded.page_views`,
    ).bind(cutoffAt, opId),
    db.prepare(
      `INSERT INTO analytics_rollup_monthly_country (la_month, country, page_views)
       SELECT substr(la_day, 1, 7), country, COUNT(*) FROM visitor_events
        WHERE occurred_at < ? AND event = 'page_view' AND ${guard} GROUP BY substr(la_day, 1, 7), country
       ON CONFLICT (la_month, country) DO UPDATE SET page_views = page_views + excluded.page_views`,
    ).bind(cutoffAt, opId),
    db.prepare(
      `DELETE FROM dndr_outbox WHERE ${guard} AND event_uid IN (SELECT event_uid FROM visitor_events WHERE occurred_at < ?)`,
    ).bind(opId, cutoffAt),
    db.prepare(`DELETE FROM visitor_events WHERE occurred_at < ? AND ${guard}`).bind(cutoffAt, opId),
  ]);
  const audited = Number(results[0]?.meta?.changes || 0) === 1;
  if (!audited) return { ok: false, error: 'stale_preview' };
  const oldestRemaining = await db.prepare('SELECT MIN(occurred_at) AS oldest, COUNT(*) AS n FROM visitor_events').first();
  return { ok: true, deleted: Number(results[5]?.meta?.changes || 0), oldestRemaining: oldestRemaining.oldest, remaining: Number(oldestRemaining.n) };
}

/** Latest operator log entries (no personal data stored there). */
export async function operatorLog(db, limit = 50) {
  const { results } = await db.prepare('SELECT * FROM analytics_operator_log ORDER BY id DESC LIMIT ?').bind(limit).all();
  return results;
}

/** Highest retention cutoff ever applied (imports must not bring older raw rows back). */
export async function retentionFloor(db) {
  const row = await db.prepare("SELECT MAX(cutoff_at) AS floor FROM analytics_operator_log WHERE action = 'delete_before'").first();
  return row && row.floor != null ? Number(row.floor) : null;
}
