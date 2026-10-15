// Execute actual built ES modules against a DOM and a loopback-only workerd.
// No third-party scripts execute; all API writes stay in the dedicated local DB.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseHTML, DOMParser, CustomEvent, Event } from 'linkedom';

const base = process.argv[2];
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base || ''), 'Only a loopback origin is permitted');
const health = await (await fetch(base + '/api/health')).json();
assert.notEqual(health.environment, 'production');
const root = path.resolve('dist');
const expected = JSON.parse(fs.readFileSync('src/data/published.json', 'utf8')).items;
const storage = new Map();
const initialDocument = parseHTML(await (await fetch(base + '/')).text()).document;

async function exercise(document, pathname) {
  const calls = [];
  const pending = new Set();
  const history = { state: {}, replaceState(s) { this.state = s; } };
  const environment = {
    document, DOMParser, CustomEvent, history,
    crypto: { randomUUID }, location: { pathname, href: base + pathname },
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    performance: { getEntriesByType: () => [{ type: 'navigate' }] },
    addEventListener() {}, scrollTo() {}, scrollY: 0,
    fetch: (url, options = {}) => {
      const target = new URL(url, base);
      assert.equal(target.origin, base, 'A client script attempted a non-local request');
      const task = fetch(target, { ...options, headers: { ...options.headers, Origin: base } }).then(async (res) => {
        const text = await res.text();
        calls.push({ path: target.pathname, query: target.search, method: options.method || 'GET', status: res.status });
        return new Response(text, { status: res.status, headers: res.headers });
      });
      pending.add(task);
      task.finally(() => pending.delete(task));
      return task;
    },
  };
  const context = vm.createContext({ ...environment, window: environment, URL, URLSearchParams, console, setTimeout, clearTimeout });
  const modules = new Map();
  async function moduleAt(href) {
    const pathname = new URL(href, base).pathname;
    const file = path.resolve(root, '.' + pathname);
    assert.ok(file.startsWith(root + path.sep), 'Module path escaped dist');
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
  }
  const linker = async (specifier, referencing) => {
    const url = specifier.startsWith('/') ? new URL(specifier, base) : new URL(specifier, new URL(path.relative(root, referencing.identifier).replaceAll('\\', '/'), base + '/'));
    assert.equal(url.origin, base);
    return moduleAt(url.href);
  };
  for (const script of document.querySelectorAll('script[type="module"]')) {
    const src = script.getAttribute('src');
    const module = src ? await moduleAt(src) : new vm.SourceTextModule(script.textContent, { context, identifier: path.join(root, pathname, '__inline__.js') });
    if (module.status === 'unlinked') await module.link(linker);
    if (module.status !== 'evaluated') await module.evaluate();
  }
  async function settled() {
    const deadline = Date.now() + 10000;
    do {
      await Promise.all([...pending]);
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(Date.now() < deadline, 'Client requests did not settle');
    } while (pending.size);
  }
  function click(element) {
    const event = new Event('click', { bubbles: true, cancelable: true });
    event.button = 0;
    element.dispatchEvent(event);
  }
  await settled();
  const first = document.querySelector('.react-btn');
  if (first) {
    click(first); click(first);
    await settled();
    assert.equal(calls.filter((c) => c.path === '/analytics/vote.php').length, 1);
    assert.equal(first.getAttribute('aria-pressed'), 'true');
  }
  if (pathname === '/') {
    assert.equal(document.querySelectorAll('.feed > .card').length, 12);
    click(document.querySelector('.load-more'));
    await settled();
    assert.equal(document.querySelectorAll('.feed > .card').length, 24);
    click(document.querySelectorAll('.feed > .card')[12].querySelector('.react-btn'));
    await settled();
    assert.equal(calls.filter((c) => c.path === '/analytics/vote.php').length, 2);
    while (document.querySelector('.load-more')) { click(document.querySelector('.load-more')); await settled(); }
    const ids = [...document.querySelectorAll('.feed > .card')].map((card) => card.dataset.id);
    assert.equal(ids.length, expected.length);
    assert.equal(new Set(ids).size, expected.length);
    assert.deepEqual(ids, [...expected].sort((a, b) => a.date < b.date ? 1 : -1).map((item) => item.id));
    assert.equal(calls.filter((c) => c.path.startsWith('/feed/')).length, 10);
  }
  assert.equal(calls.filter((c) => c.path === '/analytics/log_df.php').length, 1, 'Duplicate or missing page-view beacon');
  assert.ok(calls.every((c) => c.status === 200 || c.status === 202), JSON.stringify(calls));
  return { pathname, clientModules: modules.size, beacons: 1, votes: calls.filter((c) => c.path === '/analytics/vote.php').length, result: 'PASS' };
}

const results = [await exercise(initialDocument, '/')];
// A second document also checks module entry placement outside the homepage.
const itemLink = initialDocument.querySelector('.title-link').getAttribute('href');
storage.clear();
results.push(await exercise(parseHTML(await (await fetch(base + itemLink)).text()).document, itemLink));
console.log(JSON.stringify({ builtClient: results, remoteRequests: 0, result: 'PASS' }, null, 2));
