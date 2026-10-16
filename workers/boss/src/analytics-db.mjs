// Boss Analytics queries over ANALYTICS_DB. Every value is bound; filter text
// is matched literally (% and _ escaped). The module receives only the
// analytics database handle.
//
// Metric definitions (see docs/ANALYTICS.md):
//   Global #   visitor_events.id (ALL #) — AUTOINCREMENT, never reused or
//              renumbered; deletions leave gaps
//   Day #      today_no: position of the row among all retained rows of its PT
//              day in time order (occurred_at, then id), out of day_total;
//              filters never change it. Only an import of older events into
//              an existing day can move later rows of that day.
//   IP VISITS  retained page_view rows with exactly that address, up to the
//              same ALL # as the list being shown (rows and counts agree)
//   Addresses  distinct address strings in the view — not people

import { daysBefore, isDay, laDay, laDayBounds, laMidnight, nextDay } from '../../shared/time.mjs';

export const RETENTION_DAYS = 90;
const LIMITS = [25, 50, 100];

// Selected next to visitor_events.* wherever rows are shown (see Day # above).
const DAY_NUMBERS = `(SELECT COUNT(*) FROM visitor_events t WHERE t.la_day = visitor_events.la_day
        AND (t.occurred_at < visitor_events.occurred_at OR (t.occurred_at = visitor_events.occurred_at AND t.id <= visitor_events.id))) AS today_no,
      (SELECT COUNT(*) FROM visitor_events t WHERE t.la_day = visitor_events.la_day) AS day_total`;

function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Validated filters from a URL's query string. Unknown values are dropped. */
export function parseFilters(params, now) {
  const today = laDay(now);
  const f = { range: 'all', from: '', to: '', origin: '', cls: '', device: '', ip: '', country: '', place: '', page: '', referrer: '', browser: '', limit: 50, before: null, p: 1, snapshot: null };
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
  const p = Number(get('p'));
  if (Number.isSafeInteger(p) && p > 0) f.p = p;
  const snapshot = Number(get('snapshot'));
  if (params.has('snapshot') && Number.isSafeInteger(snapshot) && snapshot >= 0) f.snapshot = snapshot;
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
  if (f.snapshot != null) { clauses.push('id <= ?'); args.push(f.snapshot); }
  const { start, end } = rangeBounds(f);
  if (start != null) { clauses.push('occurred_at >= ?'); args.push(start); }
  if (end != null) { clauses.push('occurred_at < ?'); args.push(end); }
  if (f.origin) { clauses.push('origin = ?'); args.push(f.origin); }
  if (f.cls) { clauses.push('automation = ?'); args.push(f.cls); }
  if (f.device) { clauses.push('device_class = ?'); args.push(f.device); }
  if (f.ip) { clauses.push('ip = ?'); args.push(f.ip); }
  if (f.country) { clauses.push("(lower(country) LIKE lower(?) ESCAPE '\\' OR upper(country_code) = upper(?))"); args.push(`%${escapeLike(f.country)}%`, f.country); }
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

/** All filtered LA days by default; an explicit `days` restricts the most recent days. */
export async function daily(db, f, days = null) {
  const w = whereFor(f);
  const { results } = await db.prepare(
    `SELECT la_day AS day, COUNT(*) AS n, SUM(automation = 'human') AS human FROM visitor_events ${w.sql} GROUP BY la_day ORDER BY la_day DESC${days == null ? '' : ' LIMIT ?'}`,
  ).bind(...w.args, ...(days == null ? [] : [days])).all();
  return results.map((r) => ({ day: r.day, n: Number(r.n), human: Number(r.human || 0) })).reverse();
}

/** One page of the raw stream, newest first, keyset on id. */
export async function stream(db, f) {
  const w = whereFor(f);
  const sql = f.before != null ? (w.sql ? `${w.sql} AND id < ?` : 'WHERE id < ?') : w.sql;
  const args = f.before != null ? [...w.args, f.before] : w.args;
  const { results } = await db.prepare(
    `SELECT visitor_events.*,
            ${DAY_NUMBERS}
       FROM visitor_events ${sql}
      ORDER BY id DESC LIMIT ?`,
  ).bind(...args, f.limit + 1).all();
  const rows = results.slice(0, f.limit);
  return { rows: await decorateRows(db, rows, f.snapshot), nextBefore: results.length > f.limit ? rows[rows.length - 1].id : null };
}

async function decorateRows(db, rows, upperId = null) {
  const ips = [...new Set(rows.map((r) => r.ip).filter(Boolean))];
  const visits = new Map();
  for (let i = 0; i < ips.length; i += 90) {
    const chunk = ips.slice(i, i + 90);
    const { results: counts } = await db.prepare(
      `SELECT ip, COUNT(*) AS n FROM visitor_events WHERE event = 'page_view' AND ip IN (${chunk.map(() => '?').join(',')})${upperId == null ? '' : ' AND id <= ?'} GROUP BY ip`,
    ).bind(...chunk, ...(upperId == null ? [] : [upperId])).all();
    for (const c of counts) visits.set(c.ip, Number(c.n));
  }
  return rows.map((r) => ({ ...r, today_no: Number(r.today_no), day_total: Number(r.day_total), ip_visits: visits.get(r.ip) || 0 }));
}

/** One filtered ID scan returns page boundaries, not event bodies. No OFFSET or persistent state.
 * A frozen upper ID travels with navigation/export links so new appends cannot shift pages.
 * Exact ranges scan matching IDs; substring predicates can scan the retained log.
 * Row hydration is bounded to one page.
 */
export async function pagination(db, f) {
  const w = whereFor({ ...f, snapshot: null });
  const { results } = await db.prepare(`
    WITH snapshot AS (SELECT COALESCE(?, MAX(id), 0) AS upper_id FROM visitor_events),
    ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id DESC) AS position
      FROM visitor_events ${w.sql ? `${w.sql} AND` : 'WHERE'} id <= (SELECT upper_id FROM snapshot)
    ), pages AS (
      SELECT CAST((position - 1) / ? AS INTEGER) + 1 AS page_no,
             MAX(id) AS first_id, MIN(id) AS last_id, COUNT(*) AS n
      FROM ranked GROUP BY page_no
    )
    SELECT snapshot.upper_id, pages.* FROM snapshot LEFT JOIN pages ON 1 ORDER BY page_no
  `).bind(f.snapshot, ...w.args, f.limit).all();
  const pages = results.filter(row => row.page_no != null).map(row => ({ number: Number(row.page_no), firstId: Number(row.first_id), lastId: Number(row.last_id), rows: Number(row.n) }));
  let current = Math.min(Math.max(1, f.p || 1), Math.max(1, pages.length));
  // Old bookmarked keyset URLs remain useful; new navigation uses p + snapshot.
  if (f.before != null && f.p === 1) current = pages.find(row => row.lastId < f.before)?.number || Math.max(1, pages.length);
  return { pages, current, total: pages.reduce((n, row) => n + row.rows, 0), snapshot: Number(results[0].upper_id) };
}

/** Hydrate a bounded primary-key interval; IP VISITS counts up to the same frozen ALL #. */
export async function numberedStream(db, f, plan) {
  const selected = plan.pages[plan.current - 1];
  if (!selected) return { ...plan, rows: [], changed: false };
  const w = whereFor({ ...f, snapshot: plan.snapshot });
  const { results } = await db.prepare(`
    SELECT visitor_events.*,
      ${DAY_NUMBERS}
    FROM visitor_events ${w.sql ? `${w.sql} AND` : 'WHERE'} id BETWEEN ? AND ?
    ORDER BY id DESC LIMIT ?
  `).bind(...w.args, selected.lastId, selected.firstId, f.limit).all();
  return { ...plan, rows: await decorateRows(db, results, plan.snapshot), changed: results.length !== selected.rows };
}

/** Records matching the filters that arrived after the frozen upper ALL #. */
export async function newerCount(db, f, upperId) {
  const w = whereFor({ ...f, snapshot: null });
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM visitor_events ${w.sql ? `${w.sql} AND` : 'WHERE'} id > ?`).bind(...w.args, upperId).first();
  return Number(row?.n || 0);
}

/** Exact-address activity: indexed summaries and one bounded history page. No writes. */
export async function ipActivity(db, { address, p = 1, limit = 50, snapshot = null }) {
  // Imports may append older activity. Order history by recorded time, then ID;
  // return page boundaries only rather than loading every event into memory.
  const {results:boundaries}=await db.prepare(`
    WITH frozen AS (SELECT COALESCE(?, MAX(id), 0) AS upper_id FROM visitor_events),
    ranked AS (
      SELECT id, occurred_at, ROW_NUMBER() OVER (ORDER BY occurred_at DESC, id DESC) AS position,
             COUNT(*) OVER () AS total
      FROM visitor_events WHERE ip = ? AND id <= (SELECT upper_id FROM frozen)
    )
    SELECT frozen.upper_id, CAST((position - 1) / ? AS INTEGER) + 1 AS page_no,
      MAX(CASE WHEN (position - 1) % ? = 0 THEN id END) AS first_id,
      MAX(CASE WHEN (position - 1) % ? = 0 THEN occurred_at END) AS first_time,
      MAX(CASE WHEN position % ? = 0 OR position = total THEN id END) AS last_id,
      MAX(CASE WHEN position % ? = 0 OR position = total THEN occurred_at END) AS last_time,
      COUNT(ranked.id) AS n
    FROM frozen LEFT JOIN ranked ON 1 GROUP BY page_no ORDER BY page_no
  `).bind(snapshot,address,limit,limit,limit,limit,limit).all();
  const pages=boundaries.filter(row=>row.page_no!=null).map(row=>({number:Number(row.page_no),firstId:Number(row.first_id),lastId:Number(row.last_id),firstTime:Number(row.first_time),lastTime:Number(row.last_time),rows:Number(row.n)}));
  const plan={pages,current:Math.min(Math.max(1,p),Math.max(1,pages.length)),total:pages.reduce((n,page)=>n+page.rows,0),snapshot:Number(boundaries[0].upper_id)};
  const totals = await db.prepare(`SELECT COUNT(*) AS events,
    MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at,
    COUNT(DISTINCT la_day) AS active_days, COUNT(DISTINCT page) AS pages,
    SUM(automation = 'human') AS human, SUM(automation = 'automated') AS automated,
    SUM(origin = 'native') AS native, SUM(origin = 'legacy') AS legacy
    FROM visitor_events WHERE ip = ?`).bind(address).first();
  const selected = plan.pages[plan.current - 1];
  const rows = selected ? (await db.prepare(`SELECT visitor_events.*, ${DAY_NUMBERS} FROM visitor_events
    WHERE ip = ? AND id <= ? AND occurred_at BETWEEN ? AND ?
      AND (occurred_at != ? OR id <= ?) AND (occurred_at != ? OR id >= ?)
    ORDER BY occurred_at DESC, id DESC LIMIT ?`)
    .bind(address,plan.snapshot,selected.lastTime,selected.firstTime,selected.firstTime,selected.firstId,selected.lastTime,selected.lastId,limit).all()).results
    .map((row) => ({ ...row, today_no: Number(row.today_no), day_total: Number(row.day_total) })) : [];
  return { address, totals, history:{ ...plan,rows }, changed:selected ? rows.length!==selected.rows : false };
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
