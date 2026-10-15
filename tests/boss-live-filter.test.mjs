import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseHTML, DOMParser } from 'linkedom';
import { ANALYTICS_SCRIPT } from '../workers/boss/src/analytics-client.mjs';

const markup = (label = 'initial') => `<html><body><div class="page-head"><p class="lede">Global log</p><nav aria-label="Date range"><a data-analytics-nav href="/analytics?range=today">Today</a></nav></div>
<form id="analytics-filters"><input name="range" value="all"><input name="from"><input name="to"><input name="country"><input name="ip"><input name="place"><input name="page"><input name="referrer"><input name="browser"><select name="device"><option value="">all</option><option value="mobile">mobile</option></select><select name="limit"><option value="50">50</option><option value="100">100</option></select><button>Apply</button><a data-analytics-reset href="/analytics">Reset</a><span id="analytics-status"></span><a data-analytics-export href="/analytics/export?format=csv">CSV</a><a data-analytics-export href="/analytics/export?format=ndjson">ND</a></form>
<div id="analytics-retention">global</div><div id="analytics-metrics">${label}</div><section id="analytics-events"><h2 id="h-events">Events</h2><a data-analytics-nav href="/analytics?country=ger&p=8&snapshot=940">Next</a></section><div id="analytics-breakdowns">${label}</div></body></html>`;
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const { window, document } = parseHTML(markup());
  // linkedom exposes select.value as read-only; real HTMLSelectElement has a setter.
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true,
    get() { return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.value === value); },
  });
  const location = new URL('https://boss.example/analytics?p=8&snapshot=940');
  const requests = [], pushes = [], timers = new Map(); let nextTimer = 0;
  window.history = { pushState(_state, _title, url) { pushes.push(url); location.href = new URL(url, location).href; } };
  vm.runInNewContext(ANALYTICS_SCRIPT, { document, window, location, DOMParser, URL, AbortController,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({ url: new URL(url), options, resolve, reject })); },
  });
  const form = document.getElementById('analytics-filters');
  return { document, window, location, form, requests, pushes, timers,
    input(name, value, type = 'input') { const control = form.querySelector(`[name="${name}"]`); control.value = value; control.dispatchEvent(new window.Event(type, { bubbles: true })); },
    async tick() { for (const [id, { fn, delay }] of [...timers]) { assert.equal(delay, 350); timers.delete(id); fn(); } await flush(); },
    async answer(index, label) { requests[index].resolve(new Response(markup(label), { headers: { 'Content-Type': 'text/html' } })); await flush(); },
  };
}

test('live text filters debounce, preserve form nodes and discard stale responses even after abort races', async () => {
  const c = setup();
  c.input('country', 'g'); c.input('country', 'ge'); c.input('country', 'ger');
  assert.equal(c.requests.length, 0); assert.equal(c.timers.size, 1);
  await c.tick(); assert.equal(c.requests.length, 1);
  assert.equal(c.requests[0].url.searchParams.get('country'), 'ger');
  assert.equal(c.requests[0].url.searchParams.has('p'), false); assert.equal(c.requests[0].url.searchParams.has('snapshot'), false);
  c.input('country', 'germ'); assert.equal(c.requests[0].options.signal.aborted, true);
  await c.tick(); await c.answer(1, 'newer'); await c.answer(0, 'stale');
  assert.equal(c.document.getElementById('analytics-metrics').textContent, 'newer');
  assert.equal(c.document.getElementById('analytics-filters'), c.form);
  assert.equal(c.form.querySelector('[name="country"]').value, 'germ');
  assert.equal(c.pushes.length, 1); assert.match(c.pushes[0], /country=germ/);
});

test('dropdowns apply immediately, valid dates wait, errors retain results and submit retries', async () => {
  const c = setup();
  c.input('device', 'mobile', 'change'); assert.equal(c.requests.length, 1);
  c.requests[0].reject(new Error('offline')); await flush();
  assert.equal(c.document.getElementById('analytics-metrics').textContent, 'initial');
  assert.equal(c.document.getElementById('analytics-status').getAttribute('role'), 'alert');
  c.input('from', '2026-10-'); await c.tick(); assert.equal(c.requests.length, 1);
  c.input('from', '2026-02-30'); await c.tick(); assert.equal(c.requests.length, 1);
  c.input('from', '2026-10-01'); await c.tick(); assert.equal(c.requests.length, 2);
  await c.answer(1, 'dates');
  c.form.dispatchEvent(new c.window.Event('submit', { bubbles: true, cancelable: true })); assert.equal(c.requests.length, 3);
});

test('all six text filters debounce and unexpected login HTML cannot replace the results', async () => {
  const c = setup();
  for (const name of ['ip', 'country', 'place', 'page', 'referrer', 'browser']) c.input(name, 'example');
  assert.equal(c.requests.length, 0); await c.tick(); assert.equal(c.requests.length, 1);
  for (const name of ['ip', 'country', 'place', 'page', 'referrer', 'browser']) assert.equal(c.requests[0].url.searchParams.get(name), 'example');
  c.requests[0].resolve(new Response('<html><body>Sign in</body></html>', { headers: { 'Content-Type': 'text/html' } }));
  await flush();
  assert.equal(c.document.getElementById('analytics-metrics').textContent, 'initial');
  assert.equal(c.document.getElementById('analytics-status').getAttribute('role'), 'alert');
  assert.equal(c.pushes.length, 0);
});

test('reset clears criteria immediately and back/forward restore URL filters without another history entry', async () => {
  const c = setup(); c.input('country', 'ger');
  c.form.querySelector('[data-analytics-reset]').dispatchEvent(new c.window.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(c.form.querySelector('[name="country"]').value, ''); assert.equal(c.requests[0].url.search, '');
  await c.answer(0, 'all');
  c.location.href = 'https://boss.example/analytics?country=united&p=2';
  c.window.dispatchEvent(new c.window.Event('popstate')); assert.equal(c.form.querySelector('[name="country"]').value, 'united');
  await c.answer(1, 'united'); assert.equal(c.requests[1].url.searchParams.get('p'), '2'); assert.equal(c.pushes.length, 1);
});
