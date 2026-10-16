import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { daily, parseFilters, retentionStatus, pagination, numberedStream, summary, top } from '../workers/boss/src/analytics-db.mjs';
import { renderAnalytics } from '../workers/boss/src/pages/analytics.mjs';
import { buildNativeEvent, storeNativeEvent } from '../workers/web/src/collector.mjs';
import { applyPlan, planCorpus } from '../workers/shared/legacy-import.mjs';
import { laMidnight } from '../workers/shared/time.mjs';

const S1 = fs.readFileSync(new URL('./fixtures/legacy/panel-log-s1.ndjson', import.meta.url), 'utf8');
const NOW = laMidnight('2026-10-14') + 10 * 3600;

let seq = 0;
async function native(db, { at = NOW, ip = '203.0.113.50', path = '/', ua = 'Mozilla/5.0 Chrome/130.0' } = {}) {
  seq += 1;
  const evt = `11111111-2222-4333-8444-${String(seq).padStart(12, '0')}`;
  const { row } = buildNativeEvent({ body: { evt, path }, ip, userAgent: ua, cf: { country: 'US' }, now: at });
  return storeNativeEvent(db, row);
}

async function seeded() {
  const db = D1Sqlite.analytics();
  await applyPlan(db, await planCorpus(S1), { actor: 'test', now: NOW - 86400 * 90 });
  await native(db, { at: NOW - 3600 });
  await native(db, { at: NOW - 30, ip: '198.51.100.7', ua: 'Googlebot/2.1' });
  await native(db, { at: laMidnight('2026-10-13') + 100, path: '/item/<script>/' });
  return db;
}

const filters = (q = '') => parseFilters(new URLSearchParams(q), NOW);

async function render(q = '') {
  const db = await seeded();
  const f = filters(q);
  const plan = await pagination(db, f);
  f.snapshot = plan.snapshot;
  const [sum, days, page, country, referrer, agent, streamPage, retention] = await Promise.all([
    summary(db, f), daily(db, f), top(db, f, 'page'), top(db, f, 'country'), top(db, f, 'referrer'), top(db, f, 'agent'), numberedStream(db, f, plan), retentionStatus(db, NOW),
  ]);
  return { sum, days, html: renderAnalytics({ identity: { email: 'owner@example.com' }, f, sum, days, tops: { page, country, referrer, agent }, streamPage, retention, coverage: [], corpora: [], outbox: [] }) };
}

test('daily: per-day counts follow the view filters, oldest first, and add up to the view', async () => {
  const db = await seeded();
  const all = await daily(db, filters());
  assert.ok(all.length >= 2);
  assert.deepEqual(all.map((d) => d.day), [...all.map((d) => d.day)].sort());
  assert.equal(all.reduce((s, d) => s + d.n, 0), (await summary(db, filters())).view.events);
  const today = await daily(db, filters('range=today'));
  assert.deepEqual(today.map((d) => [d.day, d.n]), [['2026-10-14', 2]]);
  const capped = await daily(db, filters(), 1);
  assert.equal(capped.length, 1);
  assert.equal(capped[0].day, all[all.length - 1].day, 'the cap keeps the most recent days');
});

test('analytics layout: metrics, filters, event table, then breakdowns, then data operations', async () => {
  const { html } = await render();
  const at = (needle) => { const i = html.indexOf(needle); assert.ok(i >= 0, `missing ${needle}`); return i; };
  const order = [
    at('page views in view'),
    at('id="h-filters"'),
    at('/analytics/export?format=csv'),
    at('id="h-events"'),
    at('>ALL #</th>'),
    at('id="h-breakdowns"'),
    at('<h3>Top pages</h3>'),
    at('<h3>Countries</h3>'),
    at('<h3>Referrers</h3>'),
    at('<h3>Agents</h3>'),
    at('id="data-ops"'),
    at('Delete analytics records before a date'),
  ];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  for (const col of ['ALL #', 'DAY #', 'DATE / TIME (PT)', 'IP ADDRESS', 'IP VISITS', 'SOURCE', 'EVENT', 'ACTOR', 'AGENT', 'COUNTRY · CITY', 'PAGE', 'REFERRER', 'DEVICE', 'BROWSER · OS', 'DETAILS']) at(`>${col}</`);
  assert.doesNotMatch(html, /GLOBAL #/i);
  assert.match(html, /distinct IPs <span class="muted">\(not people\)<\/span>/);
  assert.doesNotMatch(html, /unique (people|visitors)/i);
});

test('analytics layout: every filter control and export link survives the redesign', async () => {
  const { html } = await render('range=7d&origin=native&class=human&device=desktop&ip=1.2.3.4&country=US&place=Austin&page=/item/*&referrer=goo&browser=Chr&limit=25');
  for (const name of ['from', 'to', 'origin', 'class', 'device', 'ip', 'country', 'place', 'page', 'referrer', 'browser', 'limit']) assert.match(html, new RegExp(`name="${name}"`), name);
  assert.match(html, /format=ndjson/);
  assert.match(html, /value="Austin"/);
  assert.match(html, /<option value="25" selected>/);
});

test('analytics layout: values are escaped and the deletion form only previews (GET)', async () => {
  const { html } = await render();
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<form method="get" action="\/analytics\/retention"/);
  assert.doesNotMatch(html, /<form method="post"/);
});

test('full daily history is not truncated and has keyboard-accessible overflow containment', async () => {
  const { html, days } = await render();
  assert.match(html, /\.chart\{[^}]*overflow-x:auto/);
  const span = (Date.parse(days[days.length - 1].day) - Date.parse(days[0].day)) / 86400000 + 1;
  assert.equal(html.match(/<span class="col in-all/g).length, span, 'every PT day from first to last record has a bar, quiet days included');
  assert.match(html, /class="chart( dense)?" tabindex="0"/);
  assert.match(html, /#analytics-page\{max-width:100%\}/);
});

test('event table: PAGE wraps long paths onto more lines; REFERRER gets a wider single-line column', async () => {
  const { html } = await render();
  const { eventColumns } = await import('../workers/boss/src/pages/analytics-event.mjs');
  const cols = Object.fromEntries(eventColumns().map((c) => [c.key, c]));
  assert.equal(cols.page.wrap, true);
  assert.ok(!cols.referrer.wrap, 'referrer stays on one line');
  const min = (c) => Number(/minmax\((\d+)px/.exec(c.w)[1]);
  assert.ok(min(cols.referrer) >= 120 && min(cols.page) >= 150);
  assert.match(html, /<td role="cell" class="c-page wide wrap"/);
  assert.match(html, /\.events-table td\.wrap\{white-space:normal;overflow-wrap:anywhere/);
});
