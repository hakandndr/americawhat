import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createBoss } from '../workers/boss/src/index.mjs';
import { resetKeyCache } from '../workers/boss/src/auth.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { FakeGitHub } from './helpers/fake-github.mjs';
import { AUD, TEAM, makeSigner } from './helpers/access-jwt.mjs';

const ORIGIN = 'https://boss.americawhat.com';
const items = [
  { id: 'aw-0001', title: 'Shared headline' },
  { id: 'aw-0002', title: 'Shared headline' },
  { id: 'aw-0003', title: 'Pinned <script>alert(1)</script>', slug: 'kept-path' },
];

async function setup() {
  resetKeyCache();
  const signer = makeSigner();
  const gh = new FakeGitHub({ 'src/data/published.json': JSON.stringify({ items }), 'src/data/pending.json': '[]' });
  const env = {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging',
    BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net',
    BOSS_CSRF_SECRET: 'csrf', BOSS_ORIGIN: ORIGIN, GITHUB_TOKEN: 'test',
    BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat-staging-content', BOSS_GITHUB_BRANCH: 'content-staging',
    BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net',
  };
  for (const [id, reaction, count] of [['aw-0001', 'lol', 4], ['aw-0002', 'lol', 9], ['aw-0003', 'wat', 5], ['aw-missing', 'dead', 2]]) {
    await env.APP_DB.prepare('INSERT INTO reaction_counts (item_id,reaction,count,updated_at) VALUES (?,?,?,?)').bind(id, reaction, count, 1).run();
  }
  const boss = createBoss({ fetchImpl: (url, init) => String(url).includes('/cdn-cgi/access/certs') ? Promise.resolve(new Response(JSON.stringify({ keys: [signer.jwk] }))) : gh.fetch(url, init) });
  const initial = gh.head();
  return { gh, async get(query = '') {
    const response = await boss.fetch(new Request(ORIGIN + '/reactions' + query, { headers: { 'Cf-Access-Jwt-Assertion': signer.sign() } }), env);
    assert.equal(response.status, 200);
    assert.equal(gh.head(), initial, 'search/sort must never create content commits');
    return parseHTML(await response.text()).document;
  } };
}

const rows = (doc) => [...doc.querySelectorAll('table[aria-label="Reaction counts"] tbody tr')];
const ids = (doc) => rows(doc).map((row) => row.firstElementChild.textContent);

test('Reactions links use complete-list canonical slugs and supported Boss edit targets', async () => {
  const ctx = await setup();
  const doc = await ctx.get();
  const paths = new Map(rows(doc).filter((row) => row.querySelector('td:nth-child(2) a')).map((row) => [row.firstElementChild.textContent, row.querySelector('td:nth-child(2) a').getAttribute('href')]));
  assert.equal(paths.get('aw-0001'), 'https://americawhat.com/item/shared-headline/');
  assert.equal(paths.get('aw-0002'), 'https://americawhat.com/item/shared-headline-2/');
  assert.equal(paths.get('aw-0003'), 'https://americawhat.com/item/kept-path/');
  for (const row of rows(doc)) {
    const link = row.querySelector('td:nth-child(2) a');
    if (!link) {
      assert.equal(row.querySelectorAll('a').length, 0);
      assert.match(row.textContent, /Not published/);
      continue;
    }
    assert.equal(link.getAttribute('target'), '_blank');
    assert.match(link.getAttribute('rel'), /noopener/);
    assert.equal(row.firstElementChild.querySelector('a').getAttribute('href'), '/published/edit?id=' + row.firstElementChild.textContent);
  }
  assert.equal(doc.querySelectorAll('script').length, 0);
  const filtered = await ctx.get('?q=aw-0002');
  assert.equal(rows(filtered)[0].querySelector('td:nth-child(2) a').getAttribute('href'), paths.get('aw-0002'));
});

test('Reactions search and both numeric sort directions preserve totals, filters and import/export controls', async () => {
  const ctx = await setup();
  assert.deepEqual(ids(await ctx.get('?q=Shared&sort=lol&dir=asc')), ['aw-0001', 'aw-0002']);
  const doc = await ctx.get('?q=Shared&sort=lol&dir=desc');
  assert.deepEqual(ids(doc), ['aw-0002', 'aw-0001']);
  assert.equal(doc.querySelector('.stats .stat b').textContent, '20', 'global totals stay global');
  assert.equal(doc.querySelector('[aria-sort]').getAttribute('aria-sort'), 'descending');
  for (const link of doc.querySelectorAll('th a')) {
    const url = new URL(link.getAttribute('href'), ORIGIN);
    assert.equal(url.searchParams.get('q'), 'Shared');
    assert.ok(['wat', 'lol', 'same', 'dead', 'total'].includes(url.searchParams.get('sort')));
  }
  assert.ok(doc.querySelector('form[action="/reactions/import"] input[name=csrf]'));
  assert.ok(doc.querySelector('a[href="/reactions/export.json"]'));
  assert.match(doc.querySelector('.table-foot').textContent, /2 of 4 items · 13 matching reactions/);
  for (const col of ['wat', 'lol', 'same', 'dead', 'total']) {
    const sorted = await ctx.get(`?sort=${col}&dir=desc`);
    const index = ['wat', 'lol', 'same', 'dead', 'total'].indexOf(col) + 2;
    const counts = rows(sorted).map((row) => Number(row.children[index].textContent));
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  }
});

test('Reactions handles unavailable metadata, missing results and hostile search/sort parameters safely', async () => {
  const ctx = await setup();
  const query = '" autofocus onfocus="alert(1)';
  const escaped = await ctx.get('?q=' + encodeURIComponent(query));
  assert.equal(escaped.querySelector('input[name=q]').getAttribute('value'), query);
  assert.equal(escaped.querySelector('[autofocus]'), null);
  assert.match(escaped.body.textContent, /No stories match/);
  assert.deepEqual(ids(await ctx.get('?sort=DROP%20TABLE&dir=bad')), ['aw-0002', 'aw-0003', 'aw-0001', 'aw-missing']);
  ctx.gh.failNext = { method: 'GET', pathIncludes: '/git/ref/', status: 503 };
  const unavailable = await ctx.get();
  assert.match(unavailable.body.textContent, /Article details are temporarily unavailable/);
  for (const row of rows(unavailable)) assert.equal(row.querySelectorAll('a').length, 0);
  assert.equal(unavailable.querySelector('.stats .stat b').textContent, '20');
});
