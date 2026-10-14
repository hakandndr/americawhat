import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { deleteBefore, parseFilters, previewDelete, retentionStatus, stream, summary, top } from '../workers/boss/src/analytics-db.mjs';
import { csvCell, exportResponse } from '../workers/boss/src/export.mjs';
import { buildNativeEvent, storeNativeEvent } from '../workers/web/src/collector.mjs';
import { applyPlan, planCorpus } from '../workers/shared/legacy-import.mjs';
import { laDayBounds, laMidnight } from '../workers/shared/time.mjs';

const S1 = fs.readFileSync(new URL('./fixtures/legacy/panel-log-s1.ndjson', import.meta.url), 'utf8');
const NOW = laMidnight('2026-10-14') + 10 * 3600; // Oct 14 10:00 AM PT

let seq = 0;
async function native(db, { at = NOW, ip = '203.0.113.50', path = '/', ua = 'Mozilla/5.0 Chrome/130.0', country = 'US' } = {}) {
  seq += 1;
  const evt = `11111111-2222-4333-8444-${String(seq).padStart(12, '0')}`;
  const { row } = buildNativeEvent({ body: { evt, path }, ip, userAgent: ua, cf: { country }, now: at });
  return storeNativeEvent(db, row);
}

async function seeded() {
  const db = D1Sqlite.analytics();
  await applyPlan(db, await planCorpus(S1), { actor: 'test', now: NOW - 86400 * 90 });
  await native(db, { at: NOW - 3600 });
  await native(db, { at: NOW - 60, path: '/item/x/' });
  await native(db, { at: NOW - 30, ip: '198.51.100.7', ua: 'Googlebot/2.1' });
  await native(db, { at: laMidnight('2026-10-13') + 100 });
  return db;
}

const filters = (q = '') => parseFilters(new URLSearchParams(q), NOW);

test('summary separates human/automated and legacy/native; addresses are not people', async () => {
  const db = await seeded();
  const s = await summary(db, filters());
  assert.equal(s.view.events, 9);
  assert.equal(s.view.legacy, 5);
  assert.equal(s.view.native, 4);
  assert.equal(s.view.human + s.view.automated, 9);
  assert.equal(s.overall.today, 3);
  assert.equal(s.overall.lastAllNo, 9);
  const today = await summary(db, filters('range=today'));
  assert.equal(today.view.events, 3);
});

test('stream: newest first, ALL # durable, TODAY # per LA day, IP VISITS all time, keyset paging', async () => {
  const db = await seeded();
  const page1 = await stream(db, filters('limit=25'));
  assert.equal(page1.rows[0].id, 9, 'highest ALL # first');
  const todays = page1.rows.filter((r) => r.la_day === '2026-10-14').map((r) => r.today_no).sort();
  assert.deepEqual(todays, [1, 2, 3]);
  const r = page1.rows.find((x) => x.ip === '203.0.113.50');
  assert.equal(r.ip_visits, 3);
  const small = await stream(db, { ...filters(), limit: 2 });
  assert.equal(small.rows.length, 2);
  const next = await stream(db, { ...filters(), limit: 2, before: small.nextBefore });
  assert.ok(next.rows.every((x) => x.id < small.nextBefore));
  // Filters never renumber TODAY #.
  const filtered = await stream(db, filters('class=automated&range=today'));
  assert.equal(filtered.rows[0].today_no, 3);
});

test('filters: origin, page prefix, literal % and _', async () => {
  const db = await seeded();
  assert.equal((await summary(db, filters('origin=legacy'))).view.events, 5);
  assert.equal((await summary(db, filters('page=/item/*'))).view.events, 3);
  assert.equal((await summary(db, filters('page=%25'))).view.events, 0);
  assert.equal((await summary(db, filters('referrer=_'))).view.events, 0);
  const pages = await top(db, filters(), 'page');
  assert.equal(pages[0].value, '/');
});

test('LA day bounds on DST days are 23 and 25 hours', () => {
  const spring = laDayBounds('2027-03-14');
  const fall = laDayBounds('2026-11-01');
  assert.equal((spring.end - spring.start) / 3600, 23);
  assert.equal((fall.end - fall.start) / 3600, 25);
});

test('CSV cells neutralise formulas; NDJSON keeps exact values', async () => {
  assert.equal(csvCell('=cmd|x'), `"'=cmd|x"`);
  assert.equal(csvCell('+SUM(1)'), `"'+SUM(1)"`);
  assert.equal(csvCell('@evil'), `"'@evil"`);
  assert.equal(csvCell('-'), '"-"');
  assert.equal(csvCell('a"b\u0000'), '"a""b"');
  const db = await seeded();
  const csv = await (await exportResponse(db, 'csv', { filters: filters('origin=legacy') }, 'x.csv')).text();
  assert.ok(csv.includes(`"'=cmd|' /C calc'!A0"`));
  const nd = await (await exportResponse(db, 'ndjson', { filters: filters('origin=legacy') }, 'x.ndjson')).text();
  const lines = nd.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 5);
  assert.ok(lines.some((l) => l.country === "=cmd|' /C calc'!A0"));
});

test('retention: overdue warning, exact preview, stale preview deletes nothing, audit and rollups', async () => {
  const db = await seeded();
  const status = await retentionStatus(db, NOW);
  assert.equal(status.overdue, true);
  assert.equal(status.overdueRecords, 5);
  const preview = await previewDelete(db, '2026-08-01');
  assert.equal(preview.count, 5);
  assert.equal(preview.kept, 4);

  // A new old row arrives after the preview: the stale count deletes nothing.
  await native(db, { at: laMidnight('2026-07-20') });
  const stale = await deleteBefore(db, { cutoffDay: '2026-08-01', expectedCount: 5, actor: 'hakan@dndr.net', opId: 'op_00000000-aaaa', now: NOW });
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'stale_preview');
  assert.equal(db.count('visitor_events'), 10);
  assert.equal(db.count('analytics_operator_log'), 0);

  const fresh = await previewDelete(db, '2026-08-01');
  const done = await deleteBefore(db, { cutoffDay: '2026-08-01', expectedCount: fresh.count, actor: 'hakan@dndr.net', opId: 'op_00000000-bbbb', now: NOW });
  assert.equal(done.ok, true);
  assert.equal(done.deleted, 6);
  assert.equal(db.count('visitor_events'), 4);
  const log = db.sqlite.prepare('SELECT * FROM analytics_operator_log').get();
  assert.equal(log.record_count, 6);
  assert.ok(!JSON.stringify(log).includes('203.0.113'), 'no address in the audit');
  // All-time totals survive as aggregates.
  const s = await summary(db, filters());
  assert.equal(s.overall.archivedPageViews, 6);
  assert.equal(s.overall.allTimePageViews, 10);
  // ALL # is never reused.
  await native(db, { at: NOW });
  assert.equal((await summary(db, filters())).overall.lastAllNo, 11);
  // Replay of the same operation id changes nothing.
  const replay = await deleteBefore(db, { cutoffDay: '2026-08-01', expectedCount: 1, actor: 'x', opId: 'op_00000000-bbbb', now: NOW });
  assert.equal(replay.ok, false);
  assert.equal(db.count('analytics_operator_log'), 1);
  // The audit log is append-only.
  await assert.rejects(() => db.prepare('DELETE FROM analytics_operator_log').run());
});

test('a later legacy import never brings deleted raw records back', async () => {
  const db = await seeded();
  const p = await previewDelete(db, '2026-08-01');
  await deleteBefore(db, { cutoffDay: '2026-08-01', expectedCount: p.count, actor: 'a', opId: 'op_11111111-cccc', now: NOW });
  const longer = `${S1}${JSON.stringify({ ip: '203.0.113.99', date: '2026-07-05 10:00:00 AM', country: 'US', city: 'X', source: 'Unknown', device: 'Desktop / Chrome 1', ua_full: 'u', referrer: 'Direct', referrer_raw: '', path: '/' })}\n`;
  const report = await applyPlan(db, await planCorpus(longer), { actor: 'a', now: NOW });
  assert.equal(report.ledger.already_present, 5);
  assert.equal(report.ledger.before_retention_cutoff, 1);
  assert.equal(db.count('visitor_events', "origin = 'legacy'"), 0);
  assert.ok(Object.values(report.checks).every(Boolean), JSON.stringify(report.checks));
});

test('delete input validation', async () => {
  const db = await seeded();
  assert.equal((await deleteBefore(db, { cutoffDay: 'nope', expectedCount: 1, actor: 'a', opId: 'op_12345678', now: NOW })).error, 'bad_date');
  assert.equal((await deleteBefore(db, { cutoffDay: '2026-08-01', expectedCount: 0, actor: 'a', opId: 'op_12345678', now: NOW })).error, 'bad_count');
  assert.equal((await deleteBefore(db, { cutoffDay: '2026-08-01', expectedCount: 1, actor: 'a', opId: 'x', now: NOW })).error, 'bad_op');
});
