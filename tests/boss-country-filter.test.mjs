import test from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { syntheticAnalyticsSql } from '../scripts/dev/synthetic-data.mjs';
import { parseFilters, summary, stream, daily, top } from '../workers/boss/src/analytics-db.mjs';
import { exportResponse } from '../workers/boss/src/export.mjs';
import { laMidnight } from '../workers/shared/time.mjs';

const NOW = laMidnight('2026-10-15') + 36000;
const f = (q) => parseFilters(new URLSearchParams(q), NOW);
async function seed() {
  const db = D1Sqlite.analytics();
  await db.exec((await syntheticAnalyticsSql({ pages: ['/', '/about/', '/item/demo/'], now: NOW })).sql);
  db.sqlite.prepare("INSERT INTO visitor_events(event_uid,origin,occurred_at,la_day,received_at,country,country_code,path,page,automation) VALUES('aw:uk','native',?,'2026-10-15',?,'United Kingdom','GB','/','/','human')").run(NOW, NOW);
  return db;
}

test('actual preview Germany records match case-insensitive country substrings and exact codes', async () => {
  const db = await seed();
  const expected = db.sqlite.prepare("SELECT COUNT(*) n FROM visitor_events WHERE country='Germany'").get().n;
  assert.ok(expected > 0, 'The real synthetic preview corpus contains Germany');
  for (const query of ['ger', 'germ', 'Germany', 'GERMANY']) {
    assert.equal((await summary(db, f('country=' + query))).view.events, expected, query);
    assert.ok((await stream(db, f('country=' + query))).rows.every(r => r.country === 'Germany'));
  }
  const coded = db.sqlite.prepare("SELECT COUNT(*) n FROM visitor_events WHERE country_code='DE'").get().n;
  for (const query of ['DE', 'de']) assert.equal((await summary(db, f('country=' + query))).view.events, coded, 'Codes match rows where the schema stores a code');
  const countries = await top(db, f('country=united'), 'country');
  assert.deepEqual(new Set(countries.map(r => r.value)), new Set(['United States', 'United Kingdom']));
  for (const query of ['%', '_', "ger' OR 1=1 --"]) assert.equal((await summary(db, f('country=' + encodeURIComponent(query)))).view.events, 0);
});

test('country combinations agree across view metrics, days, breakdowns, table and both exports', async () => {
  const db = await seed();
  for (const [query, extra] of [
    ['country=ger', ''], ['country=GER&class=human', " AND automation='human'"],
    ['country=germ&device=mobile', " AND device_class='mobile'"],
    ['country=Germany&from=2026-10-01&to=2026-10-15', " AND la_day >= '2026-10-01' AND la_day <= '2026-10-15'"],
  ]) {
    const filters = f(query);
    const expected = db.sqlite.prepare("SELECT COUNT(*) n FROM visitor_events WHERE country='Germany'" + extra).get().n;
    assert.ok(expected > 0, query);
    assert.equal((await summary(db, filters)).view.events, expected);
    assert.equal((await daily(db, filters)).reduce((sum, row) => sum + row.n, 0), expected);
    for (const column of ['page', 'country', 'referrer', 'agent']) assert.equal((await top(db, filters, column, 100)).reduce((sum, row) => sum + row.n, 0), expected);
    assert.ok((await stream(db, filters)).rows.every(row => row.country === 'Germany'));
    const ndjson = await (await exportResponse(db, 'ndjson', { filters }, 'synthetic.ndjson')).text();
    const rows = ndjson.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, expected);
    assert.ok(rows.every(row => row.country === 'Germany'));
    const csv = await (await exportResponse(db, 'csv', { filters }, 'synthetic.csv')).text();
    assert.equal(csv.trim().split('\r\n').length - 1, expected);
  }
});
