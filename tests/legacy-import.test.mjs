import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { applyPlan, dailyCounts, parseWallTime, phpTrim, planCorpus, resolveInstant } from '../workers/shared/legacy-import.mjs';
import { laDay } from '../workers/shared/time.mjs';

const S1 = fs.readFileSync(new URL('./fixtures/legacy/panel-log-s1.ndjson', import.meta.url), 'utf8');
const line = (date, ip, path = '/') => JSON.stringify({ ip, date, country: 'United States', city: 'Los Angeles, California', source: 'Unknown', device: 'Desktop / Chrome 130', ua_full: 'Mozilla/5.0 Chrome/130.0', referrer: 'Direct', referrer_raw: '', path });
// S2 = S1 plus later lines, as an append-only log would grow. Includes the
// 2026-11-01 repeated hour (twice 01:30 AM) and the 2027-03-14 skipped hour.
const S2 = S1
  + `${line('2026-11-01 01:30:00 AM', '203.0.113.30')}\n`
  + `${line('2026-11-01 01:10:00 AM', '203.0.113.31')}\n`
  + `${line('2026-11-01 01:30:00 AM', '203.0.113.32')}\n`
  + `${line('2027-03-14 02:30:00 AM', '203.0.113.33')}\n`
  + `${line('2027-03-14 03:30:00 AM', '203.0.113.34')}\n`;

test('identity matches the DNDR panel_log scheme', async () => {
  const plan = await planCorpus(S1);
  const first = S1.split('\n')[0];
  const expected = `panel_log:${createHash('sha256').update(phpTrim(first)).digest('hex').slice(0, 32)}.0`;
  assert.equal(plan.records[0].recordId, expected);
  // Two identical lines (same second, same visitor) get occurrences .0 and .1.
  assert.match(plan.records[2].recordId, /\.0$/);
  assert.match(plan.records[3].recordId, /\.1$/);
  assert.equal(plan.records[2].recordId.slice(0, -2), plan.records[3].recordId.slice(0, -2));
});

test('every line gets exactly one disposition; nothing is invented', async () => {
  const plan = await planCorpus(S1);
  assert.equal(plan.lineCount, 8);
  assert.deepEqual(
    plan.records.map((r) => r.disposition),
    ['imported', 'imported', 'imported', 'imported', 'missing_page', 'malformed', 'malformed', 'imported'],
  );
  const bot = plan.records[1].row;
  assert.equal(bot.automation, 'automated');
  assert.equal(bot.source_label, 'Googlebot');
  const human = plan.records[0].row;
  assert.equal(human.automation, 'human');
  assert.equal(human.region, '', 'region is never split out of the stored city');
  assert.equal(human.country_code, '', 'legacy lines never had a country code');
  assert.equal(plan.records[7].row.page, '/item/x/');
});

test('12-hour PT wall clock converts to the right UTC instant and LA day', async () => {
  const plan = await planCorpus(S1);
  // 2026-07-07 02:32:18 AM PDT = 09:32:18 UTC
  assert.equal(new Date(plan.records[0].row.occurred_at * 1000).toISOString(), '2026-07-07T09:32:18.000Z');
  // 11:59:59 PM PDT on Jul 8 is Jul 9 UTC but still Jul 8 in LA
  assert.equal(parseWallTime('2026-07-08 12:00:00 AM').hour, 0);
  assert.equal(parseWallTime('2026-07-08 12:00:00 PM').hour, 12);
  const r = resolveInstant(parseWallTime('2026-07-08 11:59:59 PM'), null);
  assert.equal(laDay(r.instant), '2026-07-08');
});

test('DST: repeated fall-back hour resolved by log order; skipped hour is invalid_time', async () => {
  const plan = await planCorpus(S2);
  const tail = plan.records.slice(-5);
  const [a, b, c, d, e] = tail;
  assert.equal(a.row.time_quality, 'dst_ambiguous_first');
  assert.equal(new Date(a.row.occurred_at * 1000).toISOString(), '2026-11-01T08:30:00.000Z'); // 01:30 PDT
  // 01:10 after 01:30 PDT can only be 01:10 PST (09:10 UTC), which is after 08:30 UTC
  assert.equal(b.row.time_quality, 'dst_ambiguous_ordered');
  assert.equal(new Date(b.row.occurred_at * 1000).toISOString(), '2026-11-01T09:10:00.000Z');
  assert.equal(new Date(c.row.occurred_at * 1000).toISOString(), '2026-11-01T09:30:00.000Z'); // 01:30 PST
  assert.equal(d.disposition, 'invalid_time');
  assert.equal(e.row.time_quality, 'exact');
  assert.equal(new Date(e.row.occurred_at * 1000).toISOString(), '2027-03-14T10:30:00.000Z'); // 03:30 PDT
});

test('import is idempotent; a re-run adds nothing', async () => {
  const db = D1Sqlite.analytics();
  const plan = await planCorpus(S1);
  const first = await applyPlan(db, plan, { actor: 'test', now: 1791976000 });
  assert.equal(first.eventsFromThisCorpus, 5);
  assert.ok(Object.values(first.checks).every(Boolean), JSON.stringify(first.checks));
  const again = await applyPlan(db, plan, { actor: 'test', now: 1791976100 });
  assert.equal(db.count('visitor_events'), 5);
  assert.equal(db.count('analytics_import_corpora'), 1);
  assert.equal(db.count('analytics_import_records'), 8);
  assert.ok(Object.values(again.checks).every(Boolean));
});

test('a later, longer snapshot imports only the new lines (delta)', async () => {
  const db = D1Sqlite.analytics();
  await applyPlan(db, await planCorpus(S1), { actor: 'test', now: 1791976000 });
  const plan2 = await planCorpus(S2);
  const report = await applyPlan(db, plan2, { actor: 'test', now: 1791977000 });
  assert.equal(report.ledger.already_present, 5);
  assert.equal(report.ledger.imported, 4);
  assert.equal(report.ledger.invalid_time, 1);
  assert.equal(db.count('visitor_events'), 9);
  assert.ok(Object.values(report.checks).every(Boolean), JSON.stringify(report.checks));
});

test('a partially applied run completes on retry without duplicates', async () => {
  const db = D1Sqlite.analytics();
  const plan = await planCorpus(S2);
  db.failNextBatch = { at: 3 };
  await assert.rejects(() => applyPlan(db, plan, { actor: 'test', now: 1791976000, chunkSize: 4 }));
  const report = await applyPlan(db, plan, { actor: 'test', now: 1791976000, chunkSize: 4 });
  assert.equal(db.count('visitor_events'), 9);
  assert.ok(Object.values(report.checks).every(Boolean), JSON.stringify(report.checks));
});

test('legacy rows never collide with native rows', async () => {
  const db = D1Sqlite.analytics();
  await applyPlan(db, await planCorpus(S1), { actor: 'test', now: 1791976000 });
  const origins = db.sqlite.prepare('SELECT DISTINCT origin FROM visitor_events').all().map((r) => r.origin);
  assert.deepEqual(origins, ['legacy']);
  const uids = db.sqlite.prepare('SELECT event_uid FROM visitor_events').all();
  assert.ok(uids.every((r) => r.event_uid.startsWith('panel_log:')));
});

test('daily counts for reconciliation', async () => {
  const counts = dailyCounts(await planCorpus(S1));
  assert.deepEqual(counts, { '2026-07-07': 4, '2026-07-10': 1 });
});

test('CRLF files hash the same lines as LF files', async () => {
  const a = await planCorpus(S1);
  const b = await planCorpus(S1.replace(/\n/g, '\r\n'));
  assert.deepEqual(a.records.map((r) => r.recordId), b.records.map((r) => r.recordId));
});

test('a realistic-size log (1,200 lines) imports within D1 parameter limits, idempotently', async () => {
  const db = D1Sqlite.analytics();
  let text = '';
  for (let i = 0; i < 1200; i++) {
    const minute = String(i % 60).padStart(2, '0');
    const hour = String(1 + (Math.floor(i / 60) % 11)).padStart(2, '0');
    text += `${line(`2026-08-${String(1 + Math.floor(i / 660)).padStart(2, '0')} ${hour}:${minute}:${String(i % 60).padStart(2, '0')} PM`, `203.0.113.${i % 250}`, `/item/${i}/`)}\n`;
  }
  const plan = await planCorpus(text);
  const report = await applyPlan(db, plan, { actor: 'test', now: 1791976000 });
  assert.ok(Object.values(report.checks).every(Boolean), JSON.stringify(report.checks));
  assert.equal(db.count('visitor_events'), 1200);
  await applyPlan(db, plan, { actor: 'test', now: 1791976001 });
  assert.equal(db.count('visitor_events'), 1200);
});

test('the offline .sql rendering produces exactly the same database as applyPlan', async () => {
  const { importStatements, renderSql } = await import('../workers/shared/legacy-import.mjs');
  const tricky = `${S2}${JSON.stringify({ ip: '203.0.113.90', date: '2026-07-11 01:02:03 PM', country: "Côte d'Ivoire", city: 'A  B, C', source: 'Unknown', device: 'Desktop / Chrome 1', ua_full: "Mozilla  'quoted' ? ; -- x", referrer: 'Direct', referrer_raw: "https://x.example/?q='a'&b=?", path: "/item/it's/" })}\n`;
  const plan = await planCorpus(tricky);
  const a = D1Sqlite.analytics();
  await applyPlan(a, plan, { actor: 'x', now: 100 });
  const b = D1Sqlite.analytics();
  b.sqlite.exec(renderSql(importStatements(plan, { actor: 'x', now: 100 })));
  const dump = (db) => JSON.stringify([
    db.sqlite.prepare('SELECT * FROM visitor_events ORDER BY id').all(),
    db.sqlite.prepare('SELECT * FROM analytics_import_records ORDER BY line_no').all(),
  ]);
  assert.equal(dump(b), dump(a));
  // Running the file twice adds nothing.
  b.sqlite.exec(renderSql(importStatements(plan, { actor: 'x', now: 100 })));
  assert.equal(dump(b), dump(a));
  const row = b.sqlite.prepare("SELECT user_agent, city FROM visitor_events WHERE ip = '203.0.113.90'").get();
  assert.equal(row.user_agent, "Mozilla  'quoted' ? ; -- x");
  assert.equal(row.city, 'A  B, C');
});

test('re-running the same corpus after a Delete Before Date does not resurrect deleted rows', async () => {
  const { deleteBefore, previewDelete } = await import('../workers/boss/src/analytics-db.mjs');
  const db = D1Sqlite.analytics();
  const plan = await planCorpus(S1);
  await applyPlan(db, plan, { actor: 'x', now: 1 });
  const p = await previewDelete(db, '2026-08-01');
  const r = await deleteBefore(db, { cutoffDay: '2026-08-01', expectedCount: p.count, actor: 'x', opId: 'op_22222222-dddd', now: 2 });
  assert.equal(r.ok, true);
  await applyPlan(db, plan, { actor: 'x', now: 3 });
  assert.equal(db.count('visitor_events'), 0);
});
