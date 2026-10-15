import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseHTML } from 'linkedom';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { parseFilters, pagination, numberedStream, summary, daily, top, retentionStatus } from '../workers/boss/src/analytics-db.mjs';
import { exportResponse } from '../workers/boss/src/export.mjs';
import { renderAnalytics } from '../workers/boss/src/pages/analytics.mjs';
import { laMidnight, laDay } from '../workers/shared/time.mjs';

const NOW = laMidnight('2026-10-15') + 36000;
const REPORTS = new URL('../reports/', import.meta.url);
fs.mkdirSync(REPORTS, { recursive: true });
const filters = (query = '') => parseFilters(new URLSearchParams(query), NOW);
function seed(n, gaps = false) {
  const db = D1Sqlite.analytics();
  const statement = db.sqlite.prepare(`INSERT INTO visitor_events(event_uid,origin,occurred_at,la_day,received_at,ip,country,country_code,path,page,automation,device_class) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.sqlite.exec('BEGIN');
  for (let i = 1; i <= n; i++) {
    const at = NOW - Math.floor((i - 1) / 100) * 86400;
    const country = ['Germany', 'United Kingdom', 'United States', 'Canada'][i % 4];
    statement.run(`aw:page-${i}`, i % 2 ? 'native' : 'legacy', at, laDay(at), at, `198.51.100.${i % 20 + 1}`, country, ['DE', 'GB', 'US', 'CA'][i % 4], '/', '/', i % 3 ? 'human' : 'automated', i % 2 ? 'mobile' : 'desktop');
  }
  if (gaps) db.sqlite.exec('DELETE FROM visitor_events WHERE id % 13 = 0');
  db.sqlite.exec('COMMIT');
  return db;
}
async function read(db, f) {
  const plan = await pagination(db, f);
  return { plan, page: await numberedStream(db, f, plan) };
}

test('numbered pages cover 0/1/49/50/51/940/10000 rows exactly once, including direct Last and out-of-range requests', async () => {
  const timings = [];
  for (const n of [0, 1, 49, 50, 51, 940, 10000]) {
    const db = seed(n); const start = performance.now();
    const { plan, page } = await read(db, filters('p=999999'));
    const directLastMs = performance.now() - start;
    assert.equal(plan.total, n); assert.equal(plan.pages.length, Math.ceil(n / 50));
    assert.equal(plan.current, Math.max(1, Math.ceil(n / 50)));
    assert.deepEqual(page.rows.map(row => row.id), Array.from({ length: n ? n % 50 || 50 : 0 }, (_, i) => (n % 50 || 50) - i));
    const all = [];
    for (let p = 1; p <= plan.pages.length; p++) {
      const result = await read(db, filters(`p=${p}&snapshot=${plan.snapshot}`));
      assert.equal(result.page.changed, false); all.push(...result.page.rows.map(row => row.id));
    }
    assert.deepEqual(all, Array.from({ length: n }, (_, i) => n - i)); assert.equal(new Set(all).size, n);
    timings.push({ rows: n, pages: plan.pages.length, directLastMs: Math.round(directLastMs * 100) / 100, traversalMs: Math.round(performance.now() - start) });
  }
  fs.writeFileSync(new URL('pagination-synthetic-performance.json', REPORTS), JSON.stringify(timings, null, 2));
});

test('filtered ID gaps, view counts, days, both exports and durable ALL/TODAY/IP VISITS agree', async () => {
  const db = seed(940, true);
  const f = filters('country=ger&class=human&device=desktop&from=2026-10-10&to=2026-10-15&limit=25');
  const expected = db.sqlite.prepare("SELECT id FROM visitor_events WHERE country='Germany' AND automation='human' AND device_class='desktop' AND la_day BETWEEN '2026-10-10' AND '2026-10-15' ORDER BY id DESC").all().map(row => row.id);
  const { plan } = await read(db, f); assert.equal(plan.total, expected.length); f.snapshot = plan.snapshot;
  const all = [];
  for (let p = 1; p <= plan.pages.length; p++) {
    const result = await read(db, { ...f, p });
    for (const row of result.page.rows) {
      assert.equal(row.today_no, db.sqlite.prepare('SELECT COUNT(*) n FROM visitor_events WHERE la_day=? AND id<=?').get(row.la_day, row.id).n);
      assert.equal(row.ip_visits, db.sqlite.prepare('SELECT COUNT(*) n FROM visitor_events WHERE ip=?').get(row.ip).n);
    }
    all.push(...result.page.rows.map(row => row.id));
  }
  assert.deepEqual(all, expected);
  assert.equal((await summary(db, f)).view.events, expected.length);
  assert.equal((await daily(db, f)).reduce((n, row) => n + row.n, 0), expected.length);
  for (const column of ['page', 'country', 'referrer', 'agent']) assert.equal((await top(db, f, column)).reduce((n, row) => n + row.n, 0), expected.length);
  const nd = await (await exportResponse(db, 'ndjson', { filters: f }, 'test.ndjson')).text();
  assert.deepEqual(nd.trim().split('\n').map(line => JSON.parse(line).all_no).reverse(), expected);
  const csv = await (await exportResponse(db, 'csv', { filters: f }, 'test.csv')).text();
  assert.equal(csv.trim().split('\r\n').length - 1, expected.length);
});

test('new appends cannot shift a frozen view; changing filters starts page 1 with a fresh upper ID', async () => {
  const db = seed(51);
  const { plan } = await read(db, filters());
  db.sqlite.exec("INSERT INTO visitor_events(event_uid,origin,occurred_at,la_day,received_at,path,page,automation,country) VALUES('aw:new','native',1,'2026-10-15',1,'/','/','human','Germany')");
  const frozen = await read(db, filters(`p=2&snapshot=${plan.snapshot}`));
  assert.deepEqual(frozen.page.rows.map(row => row.id), [1]); assert.equal(frozen.plan.total, 51);
  const fresh = await read(db, filters('country=ger'));
  assert.equal(fresh.plan.current, 1); assert.equal(fresh.plan.snapshot, 52); assert.equal(fresh.page.rows[0].id, 52);
  for (const p of ['-1', '0', 'oops', 'Infinity']) assert.equal((await read(db, filters('p=' + p))).plan.current, 1);
});

test('page UI has direct First/Previous/select/Next/Last with filtered ranges, URL state and boundary disabling', async () => {
  const db = seed(940);
  for (const p of [1, 8, 19]) {
    const f = filters(`p=${p}`); const { plan, page } = await read(db, f); f.snapshot = plan.snapshot;
    const html = renderAnalytics({ identity: {}, f, sum: await summary(db, f), days: [], tops: { page: [], country: [], referrer: [], agent: [] }, streamPage: page, retention: await retentionStatus(db, NOW), coverage: [], corpora: [], outbox: [] });
    const { document } = parseHTML(html); const nav = document.querySelector('[aria-label="Visitor event pages"]');
    assert.equal(document.querySelectorAll('#analytics-page option').length, 19);
    assert.equal(document.querySelector('#analytics-page option[selected]').getAttribute('value'), String(p));
    assert.ok(document.querySelector('#analytics-page').textContent.includes('Page 1 · ALL # 940–891'));
    assert.equal(nav.querySelectorAll('[aria-disabled="true"]').length, p === 8 ? 0 : 2);
    for (const link of nav.querySelectorAll('a')) assert.equal(new URL(link.getAttribute('href'), 'https://boss.example').searchParams.get('snapshot'), '940');
    assert.equal(document.querySelector('#analytics-filters [name="p"]'), null);
    assert.equal(document.querySelector('#analytics-filters [name="snapshot"]'), null);
    assert.ok(document.querySelectorAll('[data-analytics-export]')[0].getAttribute('href').includes('snapshot=940'));
  }
});

test('direct Last uses one ID-only scan and bounded PK hydration, no OFFSET, no per-page query loop', async () => {
  const db = seed(10000); const queries = []; const prepare = db.prepare.bind(db);
  db.prepare = sql => { queries.push(sql); return prepare(sql); };
  const { page } = await read(db, filters('p=999999'));
  assert.equal(page.rows.length, 50); assert.ok(queries.length <= 4);
  assert.ok(queries.every(sql => !/\bOFFSET\b/i.test(sql)));
  assert.ok(queries[0].includes('SELECT id, ROW_NUMBER()'));
  const idPlan = await prepare('EXPLAIN QUERY PLAN ' + queries[0]).bind(null, 50).all();
  const rowPlan = await prepare('EXPLAIN QUERY PLAN ' + queries[1]).bind(10000, 1, 50, 50).all();
  assert.match(rowPlan.results.map(row => row.detail).join('\n'), /INTEGER PRIMARY KEY/);
  fs.writeFileSync(new URL('pagination-query-plans.json', REPORTS), JSON.stringify({ metadata: idPlan.results, rows: rowPlan.results, queries: queries.length }, null, 2));
});
