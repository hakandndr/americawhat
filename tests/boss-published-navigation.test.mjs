import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createBoss } from '../workers/boss/src/index.mjs';
import { resetKeyCache } from '../workers/boss/src/auth.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { FakeGitHub } from './helpers/fake-github.mjs';
import { AUD, TEAM, makeSigner } from './helpers/access-jwt.mjs';

const ORIGIN = 'https://boss.americawhat.com';
const signer = makeSigner();
const items = Array.from({ length: 97 }, (_, i) => ({
  id: `aw-${String(i + 1).padStart(4, '0')}`,
  title: i < 2 ? 'Shared headline' : i === 3 ? 'Needle <script>alert(1)</script>' : `${i < 85 ? 'Match' : 'Other'} story ${i}`,
  category: i % 5 === 0 ? 'bureaucracy' : 'florida-man',
  date: '2026-10-01', comment: 'A test fact. A test observation.',
  source_url: `https://example.com/${i}`, status: 'REAL',
  ...(i === 2 ? { slug: 'kept-pinned-path' } : {}),
}));

function setup() {
  resetKeyCache();
  const gh = new FakeGitHub({ 'src/data/published.json': JSON.stringify({ items }), 'src/data/pending.json': '[]', 'src/data/fetch-status.json': '{}' });
  const env = {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging',
    BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net',
    BOSS_CSRF_SECRET: 'test-csrf', BOSS_ORIGIN: ORIGIN, GITHUB_TOKEN: 'test-token',
    BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat-staging-content', BOSS_GITHUB_BRANCH: 'content-staging',
    BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net',
  };
  const boss = createBoss({ fetchImpl: (url, init) => String(url).includes('/cdn-cgi/access/certs') ? Promise.resolve(new Response(JSON.stringify({ keys: [signer.jwk] }))) : gh.fetch(url, init) });
  const start = gh.commitCount();
  return {
    async get(query = '') {
      const response = await boss.fetch(new Request(`${ORIGIN}/published${query}`, { headers: { 'Cf-Access-Jwt-Assertion': signer.sign() } }), env);
      assert.equal(response.status, 200);
      assert.equal(gh.commitCount(), start, 'Listing requests must never publish');
      const html = await response.text();
      return { document: parseHTML(html).document, html };
    },
  };
}
const rows = (doc) => [...doc.querySelectorAll('tbody tr')].filter((row) => /^aw-/.test(row.firstElementChild?.textContent || ''));
const ids = (doc) => rows(doc).map((row) => row.firstElementChild.textContent);
const urls = (doc) => rows(doc).map((row) => [row.firstElementChild.textContent, row.querySelector('td:nth-child(7) .clip').textContent]);

test('Published pagination reaches all records once and preserves pinned/colliding URLs through filtering', async () => {
  const ctx = setup();
  const seen = [], map = new Map();
  for (let page = 1; page <= 3; page++) {
    const { document } = await ctx.get(`?p=${page}`);
    assert.equal(rows(document).length, page === 3 ? 17 : 40);
    seen.push(...ids(document));
    for (const pair of urls(document)) map.set(...pair);
  }
  assert.deepEqual(seen, items.map((item) => item.id));
  assert.equal(new Set(seen).size, 97);
  assert.equal(map.get('aw-0003'), '/item/kept-pinned-path/');
  assert.equal(map.get('aw-0002'), '/item/shared-headline-2/');
  const { document } = await ctx.get('?q=Shared&cat=florida-man');
  assert.deepEqual(ids(document), ['aw-0002']);
  assert.equal(urls(document)[0][1], map.get('aw-0002'));
});

test('Published headline and Live URL open the canonical public article, Edit stays separate', async () => {
  const { document } = await setup().get();
  for (const row of rows(document)) {
    const title = row.querySelector('td:nth-child(4) a');
    const live = row.querySelector('td:nth-child(7) a');
    assert.equal(title.getAttribute('href'), 'https://americawhat.com' + live.textContent);
    assert.equal(live.getAttribute('href'), title.getAttribute('href'));
    for (const link of [title, live]) {
      assert.equal(link.getAttribute('target'), '_blank');
      assert.match(link.getAttribute('rel'), /noopener/);
    }
    assert.match(row.querySelector('td:last-child a').getAttribute('href'), /^\/published\/edit\?id=aw-/);
  }
});

test('Published search/category/pagination compose and every pager link carries the filters', async () => {
  const ctx = setup();
  const expected = items.filter((item) => item.category === 'florida-man' && item.title.includes('Match')).map((item) => item.id);
  const actual = [];
  for (let page = 1; page <= 2; page++) {
    const { document } = await ctx.get(`?q=Match&cat=florida-man&p=${page}`);
    actual.push(...ids(document));
    for (const link of document.querySelectorAll('.pager a')) {
      const url = new URL(link.getAttribute('href'), ORIGIN);
      assert.equal(url.searchParams.get('q'), 'Match');
      assert.equal(url.searchParams.get('cat'), 'florida-man');
    }
  }
  assert.deepEqual(actual, expected);
});

test('Published clamps invalid pages, ignores unknown categories and handles an empty result', async () => {
  const ctx = setup();
  assert.equal(ids((await ctx.get('?p=999&cat=invalid')).document).length, 17);
  for (const page of ['-2', 'oops', '0']) assert.deepEqual(ids((await ctx.get(`?p=${page}`)).document), items.slice(0, 40).map((item) => item.id));
  const { document } = await ctx.get('?q=no-such-record&p=999');
  assert.equal(rows(document).length, 0);
  assert.equal(document.querySelector('.pager'), null);
  assert.ok(document.body.textContent.includes('No published story matches'));
});

test('Published query and stored headlines stay escaped in the integrated UI', async () => {
  const ctx = setup();
  const headline = await ctx.get('?q=Needle');
  assert.equal(headline.document.querySelectorAll('script').length, 0);
  assert.ok(headline.document.body.textContent.includes('<script>alert(1)</script>'));
  const payload = '\" autofocus onfocus=\"alert(1)';
  const query = await ctx.get('?q=' + encodeURIComponent(payload));
  assert.equal(query.document.querySelector('input[name="q"]').getAttribute('value'), payload);
  assert.equal(query.document.querySelector('[autofocus]'), null);
});

test('Boss navy/red theme keeps a compact narrow-screen submit bar reachable', async () => {
  const { document } = await setup().get();
  const css = document.querySelector('style').textContent;
  assert.ok(css.includes('--bg:#0b1120'));
  assert.ok(css.includes('--accent:#e23b4e'));
  const mobile = css.slice(css.indexOf('@media (max-width:760px)'));
  assert.ok(mobile.includes('.sticky-submit{position:sticky;bottom:0;padding:8px;gap:6px;'));
});
