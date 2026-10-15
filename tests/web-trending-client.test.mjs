import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { initTrending } from '../src/scripts/trending.js';

const row = (id, rank, total) => `<li data-id="${id}"><a href="/item/${id}/"><span class="trending-rank">${rank}</span><span class="trending-title">Title ${id}</span><span class="trending-count">${total}</span></a></li>`;
const STORIES = JSON.stringify([
  { id: 'aw-1', title: 'One <b>', href: '/item/one/' }, { id: 'aw-2', title: 'Two', href: '/item/two/' },
  { id: 'aw-3', title: 'Three', href: '/item/three/' }, { id: 'aw-4', title: 'Four', href: '/item/four/' },
]).replace(/</g, '\\u003c');

function page(sectionAttrs, items = '') {
  const { document } = parseHTML(`<html><body><section class="trending" id="trending" ${sectionAttrs}><ol class="trending-list" id="trending-list">${items}</ol></section>`
    + `<script id="trending-stories" type="application/json">${STORIES}</script></body></html>`);
  const calls = [];
  const env = { document, fetch: async (url) => { calls.push(url); return env.reply(url); }, reply: () => ({ json: async () => ({}) }) };
  return { document, env, calls };
}

const ids = (document) => [...document.querySelectorAll('#trending-list li')].map((li) => li.getAttribute('data-id'));
const counts = (document) => [...document.querySelectorAll('.trending-count')].map((n) => n.textContent);

test('edge-rendered strip: only the numbers change, rows and visibility stay', async () => {
  const p = page('data-trending="edge"', row('aw-2', 1, 9) + row('aw-1', 2, 5) + row('aw-3', 3, 4));
  p.env.reply = () => ({ json: async () => ({ 'aw-2': { wat: 9, lol: 1 }, 'aw-1': { wat: 2 }, 'aw-3': { dead: '7' } }) });
  await initTrending(p.env);
  assert.deepEqual(p.calls, ['/analytics/get_votes.php?ids=aw-2,aw-1,aw-3']);
  assert.deepEqual(ids(p.document), ['aw-2', 'aw-1', 'aw-3']);
  assert.deepEqual(counts(p.document), ['10', '2', '7']);
  assert.equal(p.document.getElementById('trending').hidden, false);
});

test('edge-rendered strip keeps the served numbers when the refresh fails', async () => {
  const p = page('data-trending="edge"', row('aw-2', 1, 9) + row('aw-1', 2, 5) + row('aw-3', 3, 4));
  p.env.reply = () => Promise.reject(new Error('offline'));
  await initTrending(p.env);
  assert.deepEqual(counts(p.document), ['9', '5', '4']);
});

test('too little signal at the Worker: nothing is fetched or inserted later', async () => {
  const p = page('hidden data-trending="none"');
  p.env.reply = () => ({ json: async () => ({ 'aw-1': { wat: 3 }, 'aw-2': { wat: 2 }, 'aw-3': { wat: 1 } }) });
  await initTrending(p.env);
  assert.deepEqual(p.calls, []);
  assert.equal(p.document.getElementById('trending').hidden, true);
  assert.equal(ids(p.document).length, 0);
});

test('Worker could not read D1 and had nothing cached: the browser still builds the strip', async () => {
  const p = page('hidden data-trending="unavailable"');
  p.env.reply = () => ({ json: async () => ({ 'aw-1': { wat: 3 }, 'aw-2': { wat: 2 }, 'aw-3': { wat: 1 } }) });
  await initTrending(p.env);
  assert.equal(p.calls.length, 1);
  assert.equal(p.document.getElementById('trending').hidden, false);
  assert.deepEqual(ids(p.document), ['aw-1', 'aw-2', 'aw-3']);
});

test('served without the Worker: the strip is built in the browser as before, escaped', async () => {
  const p = page('hidden');
  p.env.reply = () => ({ json: async () => ({ 'aw-1': { wat: 1 }, 'aw-2': { wat: 5 }, 'aw-3': { lol: 3 }, 'aw-4': {} }) });
  await initTrending(p.env);
  assert.deepEqual(p.calls, ['/analytics/get_votes.php?ids=aw-1,aw-2,aw-3,aw-4']);
  assert.deepEqual(ids(p.document), ['aw-2', 'aw-3', 'aw-1']);
  assert.equal(p.document.getElementById('trending').hidden, false);
  assert.equal(p.document.querySelector('[data-id="aw-1"] .trending-title').textContent, 'One <b>');

  const thin = page('hidden');
  thin.env.reply = () => ({ json: async () => ({ 'aw-1': { wat: 1 }, 'aw-2': { wat: 5 } }) });
  await initTrending(thin.env);
  assert.equal(thin.document.getElementById('trending').hidden, true);
});
