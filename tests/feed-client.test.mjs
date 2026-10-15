import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML, DOMParser, CustomEvent, Event } from 'linkedom';
import { initFeed } from '../src/scripts/feed.js';
import { initTracking } from '../src/scripts/tracking.js';

const card = (id) => `<article class="card" data-id="${id}"><a class="title-link" href="/item/${id}/">${id}</a><div class="reactions" data-id="${id}"><button class="react-btn" data-reaction="wat"><span class="react-count" data-count="wat">0</span></button></div></article>`;
const chunk = (page, ids, last = 3) => `<div data-feed data-page="${page}" data-last="${last}"><section class="feed" id="feed">${ids.map(card).join('')}</section><nav>${page < last ? `<a class="load-more" data-next="${page + 1}" href="/feed/${page + 1}/">Load more stories ↓</a>` : ''}<p class="feed-status" role="status"></p></nav></div>`;
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settled() { for (let i = 0; i < 4; i++) await tick(); }

function harness({ type = 'navigate', state = {}, fetchChunk } = {}) {
  const { document } = parseHTML(`<html><body>${chunk(1, ['aw-0001'])}</body></html>`);
  const calls = [];
  const values = new Map();
  const events = new Map();
  const history = { state, scrollRestoration: 'auto', replaceState(next) { this.state = next; } };
  const env = {
    document, DOMParser, CustomEvent, history,
    location: { pathname: '/' }, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    localStorage: { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) },
    performance: { getEntriesByType: () => [{ type }] },
    scrollY: 123, scrollTo: (position) => { env.scrolled = position.top; },
    addEventListener: (name, cb) => events.set(name, cb),
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.startsWith('/feed/')) return fetchChunk ? fetchChunk(url) : { ok: true, text: async () => chunk(Number(url.split('/')[2]), ['aw-0001', url.includes('/2/') ? 'aw-0002' : 'aw-0003']) };
      return { ok: true, json: async () => ({ 'aw-0002': { wat: 4 } }) };
    },
  };
  document.defaultView.HTMLElement.prototype.focus = function () { document.focused = this; };
  const click = (selector, extra = {}) => {
    const e = new Event('click', { bubbles: true, cancelable: true });
    Object.assign(e, { button: 0, ...extra });
    document.querySelector(selector).dispatchEvent(e);
    return e;
  };
  return { env, document, calls, click, values, events };
}

test('append skips duplicate stories, focuses a new title, wires reactions once and sends no new page view', async () => {
  const h = harness();
  initTracking(h.env);
  initFeed(h.env);
  await settled();
  h.click('.react-btn');
  h.click('.react-btn');
  await settled();
  assert.equal(h.calls.filter((c) => c.url.endsWith('/vote.php')).length, 1);
  h.click('.load-more');
  await settled();
  assert.deepEqual([...h.document.querySelectorAll('.card')].map((n) => n.dataset.id), ['aw-0001', 'aw-0002']);
  assert.equal(h.document.querySelector('.load-more').getAttribute('href'), '/feed/3/');
  assert.equal(h.document.focused.textContent, 'aw-0002');
  assert.equal(h.document.querySelector('.feed-status').textContent, '1 more story loaded.');
  const appended = h.document.querySelector('[data-id="aw-0002"]');
  assert.equal(appended.querySelector('.react-count').textContent, '4');
  h.document.dispatchEvent(new CustomEvent('aw:feed-append', { detail: { nodes: [appended] } }));
  h.click('[data-id="aw-0002"] .react-btn');
  h.click('[data-id="aw-0002"] .react-btn');
  await settled();
  assert.equal(appended.querySelector('.react-count').textContent, '5');
  assert.equal(appended.querySelector('.react-btn').getAttribute('aria-pressed'), 'true');
  assert.equal(h.calls.filter((c) => c.url.endsWith('/vote.php')).length, 2);
  assert.equal(h.calls.filter((c) => c.url.includes('get_votes.php?ids=aw-0002')).length, 1);
  assert.equal(h.calls.filter((c) => c.url.endsWith('/log_df.php')).length, 1);
  assert.equal(h.env.history.state.awFeedPage, 2);
  h.click('.load-more');
  await settled();
  assert.equal(h.document.querySelector('.load-more'), null);
  assert.equal(h.document.querySelector('.feed-end a').getAttribute('href'), '/archive/');
  assert.equal(h.document.querySelectorAll('.card').length, 3);
});

test('network errors and invalid pages retain the real fallback URL and can be retried', async () => {
  let attempts = 0;
  const h = harness({ fetchChunk: async () => {
    attempts++;
    if (attempts === 1) throw new Error('offline');
    return { ok: true, text: async () => attempts === 2 ? '<html>Wrong page</html>' : chunk(2, ['aw-0002']) };
  } });
  initFeed(h.env);
  for (let i = 0; i < 2; i++) {
    h.click('.load-more');
    await settled();
    assert.equal(h.document.querySelectorAll('.card').length, 1);
    assert.equal(h.document.querySelector('.load-more').getAttribute('href'), '/feed/2/');
    assert.equal(h.document.querySelector('.load-more').textContent, 'Try again ↓');
    assert.equal(h.document.querySelector('.load-more').hasAttribute('aria-disabled'), false);
  }
  h.click('.load-more');
  await settled();
  assert.equal(h.document.querySelectorAll('.card').length, 2);
});

test('rapid activation only fetches once; modified clicks keep native navigation', async () => {
  let release;
  const h = harness({ fetchChunk: () => new Promise((resolve) => { release = resolve; }) });
  initFeed(h.env);
  assert.equal(h.click('.load-more', { ctrlKey: true }).defaultPrevented, false);
  assert.equal(h.calls.length, 0);
  h.click('.load-more');
  h.click('.load-more');
  assert.equal(h.calls.length, 1);
  assert.equal(h.document.querySelector('.load-more').getAttribute('aria-busy'), 'true');
  release({ ok: true, text: async () => chunk(2, ['aw-0002']) });
  await settled();
  assert.equal(h.document.querySelectorAll('.card').length, 2);
});

test('reload/back restoration recovers chunks and scroll, preserving other history state', async () => {
  const h = harness({ type: 'reload', state: { awFeedPage: 3, awScroll: 800, other: 'keep' } });
  initFeed(h.env);
  await settled();
  assert.equal(h.document.querySelectorAll('.card').length, 3);
  assert.equal(h.env.scrolled, 800);
  assert.equal(h.env.history.scrollRestoration, 'auto');
  assert.equal(h.env.history.state.other, 'keep');
  assert.equal(h.document.focused, undefined);
  h.events.get('pagehide')();
  assert.equal(h.env.history.state.awScroll, 123);
});

test('fresh navigation starts with one chunk and stored votes restore even if count reads fail', async () => {
  const h = harness({ state: { awFeedPage: 3, awScroll: 800, other: 'keep' } });
  h.values.set('aw_voted_aw-0001_wat', '1');
  const fetch = h.env.fetch;
  h.env.fetch = (url, options) => url.includes('get_votes') ? Promise.reject(new Error('offline')) : fetch(url, options);
  initTracking(h.env);
  initFeed(h.env);
  await settled();
  assert.equal(h.document.querySelector('.react-btn').getAttribute('aria-pressed'), 'true');
  assert.equal(h.document.querySelectorAll('.card').length, 1);
  assert.equal(h.env.history.state.awFeedPage, undefined);
  assert.equal(h.env.history.state.other, 'keep');
});

test('denied browser storage does not prevent analytics or reaction binding', async () => {
  const h = harness();
  Object.defineProperty(h.env, 'localStorage', { get() { throw new Error('Storage denied'); } });
  initTracking(h.env);
  await settled();
  h.click('.react-btn');
  await settled();
  assert.equal(h.calls.filter((c) => c.url.endsWith('/log_df.php')).length, 1);
  assert.equal(h.calls.filter((c) => c.url.endsWith('/vote.php')).length, 1);
});
