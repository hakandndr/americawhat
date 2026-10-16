import test from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import worker from '../workers/web/src/index.mjs';
import { readTopTotals } from '../workers/web/src/reactions.mjs';
import {
  TRENDING_FRESH_MS, TRENDING_MAX, loadTrending, pickTrending, resetTrending, storiesById, trendingItemsHtml,
} from '../workers/web/src/trending.mjs';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';

const story = (id, date, title = `Story ${id}`) => [id, { id, title, href: `/item/${id}/`, date }];
const STORIES = new Map([
  story('aw-a', '2026-10-01'), story('aw-b', '2026-10-02'), story('aw-c', '2026-10-03'),
  story('aw-d', '2026-10-04'), story('aw-e', '2026-10-05'), story('aw-f', '2026-10-06'),
]);

function seed(db, rows) {
  for (const [id, reaction, count] of rows) {
    db.sqlite.prepare('INSERT INTO reaction_counts (item_id, reaction, count, updated_at) VALUES (?, ?, ?, 0)').run(id, reaction, count);
  }
}

/** Counts every statement the code prepares. */
function counting(db) {
  const prepared = [];
  return {
    prepared,
    prepare(sql) { prepared.push(sql); return db.prepare(sql); },
  };
}

test('top totals: one statement, the four reactions summed, zero totals left out, bounded', async () => {
  const db = D1Sqlite.app();
  seed(db, [
    ['aw-a', 'wat', 3], ['aw-a', 'lol', 2], ['aw-b', 'dead', 9], ['aw-c', 'same', 0], ['aw-d', 'wat', 1],
  ]);
  const spy = counting(db);
  assert.deepEqual(await readTopTotals(spy), [
    { item_id: 'aw-b', total: 9 }, { item_id: 'aw-a', total: 5 }, { item_id: 'aw-d', total: 1 },
  ]);
  assert.equal(spy.prepared.length, 1);
  assert.match(spy.prepared[0], /LIMIT \?/);
  assert.deepEqual(await readTopTotals(db, 2), [{ item_id: 'aw-b', total: 9 }, { item_id: 'aw-a', total: 5 }]);
});

test('pick: published stories only, most reacted first, newest first on a tie, at most five', () => {
  const top = pickTrending([
    { item_id: 'aw-gone', total: 99 }, { item_id: 'aw-a', total: 7 }, { item_id: 'aw-b', total: 3 },
    { item_id: 'aw-c', total: 3 }, { item_id: 'aw-d', total: 2 }, { item_id: 'aw-e', total: 2 }, { item_id: 'aw-f', total: 1 },
  ], STORIES);
  assert.deepEqual(top.map((r) => r.id), ['aw-a', 'aw-c', 'aw-b', 'aw-e', 'aw-d']);
  assert.equal(top.length, TRENDING_MAX);
});

test('pick: fewer than three stories with reactions shows nothing', () => {
  assert.deepEqual(pickTrending([{ item_id: 'aw-a', total: 5 }, { item_id: 'aw-b', total: 1 }, { item_id: 'aw-gone', total: 9 }], STORIES), []);
  assert.deepEqual(pickTrending([], STORIES), []);
});

test('rows keep the page markup and escape every value', () => {
  const html = trendingItemsHtml([
    { id: 'aw-a', title: `<img src=x onerror="alert('1')"> & co`, href: '/item/a"b/', total: 12 },
  ]);
  assert.equal(html, '<li data-id="aw-a"><a href="/item/a&quot;b/"><span class="trending-rank">1</span>'
    + '<span class="trending-title">&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt; &amp; co</span>'
    + '<span class="trending-count">12</span></a></li>');
});

const BUILT_HOME = new URL('../dist/index.html', import.meta.url);

test('stories match the titles and URLs the built homepage lists', { skip: !fs.existsSync(BUILT_HOME) && 'dist not built' }, () => {
  const html = fs.readFileSync(BUILT_HOME, 'utf8');
  const listed = JSON.parse(html.match(/<script id="trending-stories" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const stories = storiesById();
  assert.equal(stories.size, listed.length);
  for (const { id, title, href } of listed) assert.deepEqual([stories.get(id).title, stories.get(id).href], [title, href]);
  assert.match(html, /<section class="trending" id="trending" hidden>/);
  assert.match(html, /<ol class="trending-list" id="trending-list"><\/ol>/);
});

test('load: edge with real signal, none without, unavailable on D1 error or timeout', async () => {
  const db = D1Sqlite.app();
  const [a, b, c] = [...storiesById().keys()];
  resetTrending();
  assert.deepEqual(await loadTrending(db), { state: 'none', top: [] });
  seed(db, [[a, 'wat', 5], [b, 'lol', 4], [c, 'dead', 3]]);
  resetTrending();
  const loaded = await loadTrending(db);
  assert.equal(loaded.state, 'edge');
  assert.deepEqual(loaded.top.map((r) => [r.id, r.total]), [[a, 5], [b, 4], [c, 3]]);

  resetTrending();
  const broken = { prepare() { throw new Error('D1_ERROR: no such table'); } };
  assert.deepEqual(await loadTrending(broken), { state: 'unavailable', top: [] });
  resetTrending();
  const slow = { prepare: () => ({ bind: () => ({ all: () => new Promise(() => {}) }) }) };
  const started = Date.now();
  assert.deepEqual(await loadTrending(slow, 20), { state: 'unavailable', top: [] });
  assert.ok(Date.now() - started < 1000);
});

test('load: a fresh result is reused without D1; a failed or slow read serves the last good strip', async () => {
  resetTrending();
  const db = D1Sqlite.app();
  const [a, b, c] = [...storiesById().keys()];
  seed(db, [[a, 'wat', 5], [b, 'lol', 4], [c, 'dead', 3]]);
  const spy = counting(db);
  const t0 = 1_000_000;
  const first = await loadTrending(spy, 300, t0);
  assert.equal(first.state, 'edge');
  assert.deepEqual(await loadTrending(spy, 300, t0 + TRENDING_FRESH_MS - 1), first);
  assert.equal(spy.prepared.length, 1, 'fresh result served from the isolate');
  const broken = { prepare() { throw new Error('D1_ERROR: transient'); } };
  assert.deepEqual(await loadTrending(broken, 300, t0 + TRENDING_FRESH_MS + 1), first, 'transient failure keeps the strip');
  const slow = { prepare: () => ({ bind: () => ({ all: () => new Promise(() => {}) }) }) };
  assert.deepEqual(await loadTrending(slow, 20, t0 + TRENDING_FRESH_MS + 2), first, 'slow read keeps the strip');
  const concurrent = counting(db);
  await Promise.all([1, 2, 3].map(() => loadTrending(concurrent, 300, t0 + 2 * TRENDING_FRESH_MS)));
  assert.equal(concurrent.prepared.length, 1, 'concurrent misses share one read');
  resetTrending();
});

test('homepage asset is fetched without conditional headers; non-HTML passes through untouched', async () => {
  const seen = [];
  const env = {
    APP_DB: D1Sqlite.app(),
    ANALYTICS_DB: D1Sqlite.analytics(),
    ENVIRONMENT: 'staging',
    ASSETS: {
      fetch: async (r) => {
        seen.push({ path: new URL(r.url).pathname, inm: r.headers.get('If-None-Match'), ims: r.headers.get('If-Modified-Since') });
        return new Response('not html', { status: 200, headers: { 'Content-Type': 'text/plain', ETag: '"x"' } });
      },
    },
  };
  const headers = { 'If-None-Match': '"old"', 'If-Modified-Since': 'Wed, 01 Oct 2026 00:00:00 GMT' };
  const home = await worker.fetch(new Request('https://example.test/', { headers }), env, {});
  assert.equal(await home.text(), 'not html');
  const about = await worker.fetch(new Request('https://example.test/about/', { headers }), env, {});
  assert.equal(about.status, 200);
  assert.deepEqual(seen, [
    { path: '/', inm: null, ims: null },
    { path: '/about/', inm: '"old"', ims: 'Wed, 01 Oct 2026 00:00:00 GMT' },
  ]);
});

// HTMLRewriter exists only in the Workers runtime. This stand-in applies the
// same element handlers to a linkedom DOM, enough to check what the Worker
// writes; the real rewriter was exercised under workerd (`wrangler dev`).
class DomRewriter {
  constructor() { this.handlers = []; }
  on(selector, handler) { this.handlers.push([selector, handler]); return this; }
  transform(response) {
    const handlers = this.handlers;
    const body = response.text().then((html) => {
      const { document } = parseHTML(html);
      for (const [selector, handler] of handlers) {
        for (const node of document.querySelectorAll(selector)) {
          handler.element({
            setAttribute: (k, v) => node.setAttribute(k, v),
            removeAttribute: (k) => node.removeAttribute(k),
            setInnerContent: (content, { html: raw } = {}) => { if (raw) node.innerHTML = content; else node.textContent = content; },
          });
        }
      }
      return document.toString();
    });
    const stream = new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(await body)); c.close(); } });
    return new Response(stream, response);
  }
}

const HOME = '<!DOCTYPE html><html><body><main><section class="trending" id="trending" hidden><div class="trending-head">Trending</div>'
  + '<ol class="trending-list" id="trending-list"></ol></section><nav class="cat-bar"></nav></main></body></html>';

async function home(db) {
  resetTrending();
  globalThis.HTMLRewriter = DomRewriter;
  try {
    const env = {
      APP_DB: db, ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging',
      ASSETS: { fetch: async () => new Response(HOME, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"static"' } }) },
    };
    const res = await worker.fetch(new Request('https://example.test/'), env, {});
    const { document } = parseHTML(await res.text());
    return { res, document, section: document.getElementById('trending') };
  } finally {
    delete globalThis.HTMLRewriter;
  }
}

test('worker: homepage arrives with the top five filled and visible, before the category bar', async () => {
  const db = D1Sqlite.app();
  const ids = [...storiesById().keys()];
  seed(db, [[ids[0], 'wat', 2], [ids[1], 'lol', 9], [ids[2], 'dead', 4], [ids[2], 'same', 4], [ids[3], 'wat', 5],
    [ids[4], 'same', 3], [ids[5], 'wat', 1], ['aw-not-published', 'wat', 500]]);
  const { res, document, section } = await home(db);
  assert.equal(res.headers.get('ETag'), null);
  assert.equal(section.hasAttribute('hidden'), false);
  assert.equal(section.getAttribute('data-trending'), 'edge');
  const rows = [...document.querySelectorAll('#trending-list li')];
  assert.deepEqual(rows.map((li) => li.getAttribute('data-id')), [ids[1], ids[2], ids[3], ids[4], ids[0]]);
  assert.deepEqual(rows.map((li) => li.querySelector('.trending-count').textContent), ['9', '8', '5', '3', '2']);
  assert.equal(rows[1].querySelector('a').getAttribute('href'), storiesById().get(ids[2]).href);
  assert.equal(section.nextElementSibling.className, 'cat-bar');
});

test('worker: too little signal or a failing D1 keeps the strip hidden and the page served', async () => {
  const db = D1Sqlite.app();
  const ids = [...storiesById().keys()];
  seed(db, [[ids[0], 'wat', 3], [ids[1], 'lol', 1]]);
  let out = await home(db);
  assert.equal(out.res.status, 200);
  assert.equal(out.section.hasAttribute('hidden'), true);
  assert.equal(out.section.getAttribute('data-trending'), 'none');
  assert.equal(out.document.querySelectorAll('#trending-list li').length, 0);

  out = await home({ prepare() { throw new Error('D1_ERROR'); } });
  assert.equal(out.res.status, 200);
  assert.equal(out.section.hasAttribute('hidden'), true);
  assert.equal(out.section.getAttribute('data-trending'), 'unavailable');
  assert.equal(out.document.querySelectorAll('#trending-list li').length, 0);
});

test('worker: HEAD of the homepage skips D1 and carries no stale ETag', async () => {
  const db = { prepare() { throw new Error('HEAD must not read D1'); } };
  const env = {
    APP_DB: db, ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging',
    ASSETS: { fetch: async () => new Response(HOME, { headers: { 'Content-Type': 'text/html', ETag: '"static"', 'Content-Length': String(HOME.length) } }) },
  };
  const res = await worker.fetch(new Request('https://example.test/', { method: 'HEAD' }), env, {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('ETag'), null);
  assert.equal(res.headers.get('Content-Length'), null);
});
