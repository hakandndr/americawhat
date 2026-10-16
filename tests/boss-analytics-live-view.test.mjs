// Regression: production Boss Analytics froze at the first visit. The server put
// the current upper ALL # ("snapshot") and p=1 into data-view-url and the client
// wrote that into the address bar, so /analytics became /analytics?snapshot=N&p=1;
// new visits were stored but never shown, while IP VISITS counted them anyway.
// This test drives the REAL router (Access-verified, SQLite D1) together with the
// REAL client script: direct load, top-menu navigation, new events, Refresh,
// filters, paging on a fixed list, and browser Back/Forward.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseHTML, DOMParser } from 'linkedom';
import { createBoss } from '../workers/boss/src/index.mjs';
import { resetKeyCache } from '../workers/boss/src/auth.mjs';
import { ANALYTICS_SCRIPT } from '../workers/boss/src/analytics-client.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { AUD, TEAM, makeSigner } from './helpers/access-jwt.mjs';

const ORIGIN = 'https://boss.americawhat.com';
const signer = makeSigner();
// Real clock (Access assertions are time-checked); events sit in the last hour of today (PT).
const BASE_TIME = Math.floor(Date.now() / 1000) - 3600;
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(BASE_TIME * 1000));
const flush = async () => { for (let i = 0; i < 60; i++) await new Promise((r) => setImmediate(r)); };

function setupServer() {
  resetKeyCache();
  const env = {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'production',
    BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net',
    BOSS_CSRF_SECRET: 'csrf-test', BOSS_ORIGIN: ORIGIN, GITHUB_TOKEN: 'tok',
    BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat', BOSS_GITHUB_BRANCH: 'main',
    BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net',
  };
  const boss = createBoss({
    fetchImpl: async (url) => {
      if (String(url).includes('/cdn-cgi/access/certs')) return new Response(JSON.stringify({ keys: [signer.jwk] }));
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  let n = 0;
  const add = (count, { ip = '192.0.2.10', page = '/item/example/' } = {}) => {
    const stmt = env.ANALYTICS_DB.sqlite.prepare(`INSERT INTO visitor_events (event_uid, origin, occurred_at, la_day, received_at, ip, path, page, automation, device_class)
      VALUES (?, 'native', ?, ?, ?, ?, ?, ?, 'human', 'desktop')`);
    for (let i = 0; i < count; i++) { n++; stmt.run(`evt-${n}`, BASE_TIME + n, DAY, BASE_TIME + n, ip, page, page); }
  };
  const get = (path) => boss.fetch(new Request(new URL(path, ORIGIN), { headers: { 'Cf-Access-Jwt-Assertion': signer.sign(), Accept: 'text/html' } }), env);
  return { env, add, get, maxId: () => n };
}

/** Loads the server's HTML for `path` in a minimal browser with a history stack and runs the client. */
async function openBrowser(server, path) {
  const res = await server.get(path);
  assert.equal(res.status, 200);
  const { window, document } = parseHTML(await res.text());
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true,
    get() { return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.value === value); },
  });
  const location = new URL(path, ORIGIN);
  const entries = [location.pathname + location.search];
  let index = 0;
  const log = { pushes: [], replacements: [] };
  const listeners = [];
  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, fn, opts) => (type === 'popstate' ? listeners.push(fn) : realAdd(type, fn, opts));
  window.history = {
    pushState(_s, _t, url) { log.pushes.push(url); entries.splice(index + 1); entries.push(url); index++; location.href = new URL(url, ORIGIN).href; },
    replaceState(_s, _t, url) { log.replacements.push(url); entries[index] = url; location.href = new URL(url, ORIGIN).href; },
  };
  const pending = [];
  vm.runInNewContext(ANALYTICS_SCRIPT, {
    document, window, location, DOMParser, URL, AbortController,
    setTimeout: (fn) => { pending.push(fn); return pending.length; }, clearTimeout() {},
    fetch: async (url) => server.get(new URL(url).pathname + new URL(url).search),
  });
  const go = async (delta) => { index += delta; location.href = new URL(entries[index], ORIGIN).href; for (const fn of listeners) fn({}); await flush(); };
  const click = async (selector) => {
    const link = document.querySelector(selector);
    assert.ok(link, `link ${selector}`);
    link.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    await flush();
  };
  const ids = () => [...document.querySelectorAll('#analytics-events td.c-all')].map((td) => Number(td.textContent.trim()));
  const visits = () => [...document.querySelectorAll('#analytics-events td.c-visits')].map((td) => Number(td.textContent.trim()));
  const url = () => location.pathname + location.search;
  const freshness = () => document.getElementById('analytics-freshness')?.textContent.replace(/\s+/g, ' ').trim() || '';
  return { window, document, location, log, go, click, ids, visits, url, freshness, back: () => go(-1), forward: () => go(1),
    async submitFilter(name, value) {
      const form = document.getElementById('analytics-filters');
      form.querySelector(`[name="${name}"]`).value = value;
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await flush();
    } };
}

test('direct /analytics keeps its clean URL and shows the newest records first', async () => {
  const s = setupServer();
  s.add(60);
  const b = await openBrowser(s, '/analytics');
  assert.equal(b.document.getElementById('analytics-filters').getAttribute('data-view-url'), '/analytics');
  assert.deepEqual(b.log.replacements, [], 'no snapshot/p rewrite of the address');
  assert.equal(b.url(), '/analytics');
  assert.equal(b.ids()[0], 60);
  assert.match(b.freshness(), /Latest records up to ALL # 60 · Refresh/);
});

test('top-menu navigation always loads the latest events; Refresh shows new arrivals in place', async () => {
  const s = setupServer();
  s.add(10);
  const b = await openBrowser(s, '/analytics');
  s.add(3); // visits stored after the page was opened
  assert.equal(b.ids()[0], 10, 'the open page does not change by itself');
  await b.click('#analytics-freshness a');
  assert.equal(b.ids()[0], 13, 'Refresh shows them');
  assert.equal(b.url(), '/analytics');
  assert.deepEqual(b.log.pushes, [], 'refreshing the live view adds no history entry');
  // Top menu (a full page load of /analytics) is always live too.
  s.add(2);
  const again = await openBrowser(s, '/analytics');
  assert.equal(again.ids()[0], 15);
  assert.equal(again.url(), '/analytics');
});

test('filters stay clean and live; Refresh keeps the selected range and filters', async () => {
  const s = setupServer();
  s.add(5, { page: '/item/a/' });
  s.add(5, { page: '/item/b/' });
  const b = await openBrowser(s, '/analytics?range=today');
  await b.submitFilter('page', '/item/a/');
  assert.equal(b.url(), '/analytics?range=today&page=%2Fitem%2Fa%2F');
  assert.ok(!b.url().includes('snapshot'));
  assert.deepEqual(b.ids(), [5, 4, 3, 2, 1]);
  s.add(2, { page: '/item/a/' });
  s.add(1, { page: '/item/b/' });
  await b.click('#analytics-freshness a');
  assert.equal(b.url(), '/analytics?range=today&page=%2Fitem%2Fa%2F', 'filters and range survive Refresh');
  assert.deepEqual(b.ids(), [12, 11, 5, 4, 3, 2, 1]);
});

test('paging pins a fixed list; new arrivals neither shift pages nor leak into IP VISITS; Back/Forward behave', async () => {
  const s = setupServer();
  s.add(120); // 50 per page: pages 1–3
  const b = await openBrowser(s, '/analytics');
  assert.equal(b.ids()[0], 120);
  await b.click('#analytics-events a[data-analytics-nav][href*="p=2"]');
  assert.match(b.url(), /^\/analytics\?snapshot=120&p=2$/);
  const page2 = b.ids();
  assert.deepEqual([page2[0], page2.at(-1)], [70, 21]);
  assert.ok(b.visits().every((v) => v === 120), 'IP VISITS counts up to the same ALL # as the rows');
  assert.match(b.freshness(), /Fixed list up to ALL # 120/);

  s.add(7); // arrives while browsing the fixed list
  await b.click('#analytics-events a[data-analytics-nav][href*="p=3"]');
  await b.click('#analytics-events a[data-analytics-nav][href*="p=2"]');
  assert.deepEqual(b.ids(), page2, 'pages are stable');
  assert.ok(b.visits().every((v) => v === 120), 'new arrivals are not counted in the fixed list');
  assert.match(b.freshness(), /7 newer records arrived since\. Show latest/);

  await b.back(); await b.back(); await b.back(); // p2 ← p3 ← p2 ← /analytics
  assert.equal(b.url(), '/analytics');
  assert.equal(b.ids()[0], 127, 'Back to /analytics shows the latest records');
  assert.ok(b.visits().every((v) => v === 127), 'the live view counts everything it shows');
  await b.forward();
  assert.match(b.url(), /snapshot=120&p=2/);
  assert.deepEqual(b.ids(), page2, 'Forward returns to the same fixed page');

  await b.click('#analytics-freshness a');
  assert.equal(b.url(), '/analytics', 'Show latest returns to the clean live URL');
  assert.equal(b.ids()[0], 127);
});

test('an explicit snapshot URL (bookmark, pager) is honoured and kept', async () => {
  const s = setupServer();
  s.add(80);
  const b = await openBrowser(s, '/analytics?snapshot=60&p=1');
  assert.equal(b.ids()[0], 60);
  assert.equal(b.url(), '/analytics?snapshot=60&p=1');
  assert.match(b.freshness(), /Fixed list up to ALL # 60 so pages stay stable\. 20 newer records arrived since\. Show latest/);
});
