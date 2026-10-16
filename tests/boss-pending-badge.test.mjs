import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createBoss } from '../workers/boss/src/index.mjs';
import { resetKeyCache } from '../workers/boss/src/auth.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { FakeGitHub } from './helpers/fake-github.mjs';
import { AUD, TEAM, makeSigner } from './helpers/access-jwt.mjs';

// The red count beside "Weekly review" is the number of pending records
// (not story clusters), read live from GitHub, on every Boss page.

const ORIGIN = 'https://boss.americawhat.com';
const signer = makeSigner();
const candidate = (i, title) => ({ id: `aw-p-${i}`, seen_id: `src-${i}`, title, category: 'florida-man', source_url: '', external_url: `https://example.com/${i}`, source_domain: 'example.com', date: '2026-10-14', score: 3 });
// Three copies of one story plus two other stories: 5 records, 3 clusters.
const pending = [candidate(1, 'Man paints goat purple'), candidate(2, 'Man paints goat purple'), candidate(3, 'Man paints goat purple'), candidate(4, 'City fines vulture feeder'), candidate(5, 'HOA bans porch pumpkins')];

function setup({ files } = {}) {
  resetKeyCache();
  let now = Date.now();
  const gh = new FakeGitHub(files || { 'src/data/published.json': JSON.stringify({ items: [] }), 'src/data/pending.json': JSON.stringify(pending), 'src/data/fetch-status.json': '{}' });
  const env = {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging',
    BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net',
    BOSS_CSRF_SECRET: 'test-csrf', BOSS_ORIGIN: ORIGIN, GITHUB_TOKEN: 'test-token',
    BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat-staging-content', BOSS_GITHUB_BRANCH: 'content-staging',
    BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net',
  };
  const boss = createBoss({ clock: () => now, fetchImpl: (url, init) => String(url).includes('/cdn-cgi/access/certs') ? Promise.resolve(new Response(JSON.stringify({ keys: [signer.jwk] }))) : gh.fetch(url, init) });
  return {
    gh,
    advance(ms) { now += ms; },
    async nav(path) {
      const response = await boss.fetch(new Request(`${ORIGIN}${path}`, { headers: { 'Cf-Access-Jwt-Assertion': signer.sign() } }), env);
      const html = await response.text();
      assert.ok(!html.includes('aw-pending-count'), 'the marker never reaches the browser');
      const link = parseHTML(html).document.querySelector('nav[aria-label="Boss sections"] a[href="/review"]');
      const pub = parseHTML(html).document.querySelector('nav[aria-label="Boss sections"] a[href="/published"]');
      return { status: response.status, link, badge: link?.querySelector('.nav-count')?.textContent ?? null, published: pub?.querySelector('.nav-count')?.textContent ?? null, pubLink: pub };
    },
  };
}

test('every Boss page shows the pending record count beside Weekly review', async () => {
  const ctx = setup();
  for (const path of ['/review', '/published', '/analytics', '/reactions', '/audit', '/health']) {
    const { link, badge } = await ctx.nav(path);
    assert.equal(badge, '5', `${path} counts records, not the 3 story clusters`);
    assert.match(link.textContent, /^Weekly review5 \(5 pending\)$/);
  }
});

test('the count follows new pending records after a fetch commit', async () => {
  const ctx = setup();
  assert.equal((await ctx.nav('/published')).badge, '5');
  ctx.gh.externalCommit((files) => { files['src/data/pending.json'] = JSON.stringify([...pending, candidate(6, 'Raccoon enters bakery')]); });
  ctx.advance(61 * 1000);
  assert.equal((await ctx.nav('/published')).badge, '6');
  assert.equal((await ctx.nav('/review')).badge, '6');
});

test('an empty queue shows 0 and an unreadable GitHub drops the badge without breaking the page', async () => {
  const empty = setup({ files: { 'src/data/published.json': JSON.stringify({ items: [] }), 'src/data/pending.json': '[]', 'src/data/fetch-status.json': '{}' } });
  assert.equal((await empty.nav('/audit')).badge, '0');
  const broken = setup();
  broken.gh.failNext = { method: 'GET', pathIncludes: '/git/ref/', status: 500 };
  const { status, badge, link } = await broken.nav('/audit');
  assert.equal(status, 200);
  assert.equal(badge, null);
  assert.equal(link.textContent, 'Weekly review');
});

test('Published shows the number of published stories from published.json, and follows new commits', async () => {
  const ctx = setup({ files: { 'src/data/published.json': JSON.stringify({ items: [{ id: 'aw-0001' }, { id: 'aw-0002' }, { id: 'aw-0003' }] }), 'src/data/pending.json': JSON.stringify(pending), 'src/data/fetch-status.json': '{}' } });
  for (const path of ['/review', '/published', '/audit']) {
    const { published, pubLink, badge } = await ctx.nav(path);
    assert.equal(published, '3', path);
    assert.equal(badge, '5');
    assert.match(pubLink.textContent, /^Published3 \(3 published\)$/);
  }
  ctx.gh.externalCommit((files) => { files['src/data/published.json'] = JSON.stringify({ items: [{ id: 'aw-0004' }, { id: 'aw-0001' }, { id: 'aw-0002' }, { id: 'aw-0003' }] }); });
  ctx.advance(61 * 1000);
  assert.equal((await ctx.nav('/audit')).published, '4');
});
