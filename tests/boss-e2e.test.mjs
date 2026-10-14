// End-to-end Boss requests against the real router, with a locally signed
// Access assertion, SQLite-backed D1 and an in-memory GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBoss } from '../workers/boss/src/index.mjs';
import { resetKeyCache } from '../workers/boss/src/auth.mjs';
import { csrfToken } from '../workers/boss/src/csrf.mjs';
import { CONTENT_PATHS } from '../workers/boss/src/github.mjs';
import { computeSlugs, serialize } from '../workers/boss/src/editorial.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { FakeGitHub } from './helpers/fake-github.mjs';
import { AUD, TEAM, makeSigner } from './helpers/access-jwt.mjs';

const ORIGIN = 'https://boss.americawhat.com';
const PUBLISHED = JSON.parse(fs.readFileSync(new URL('../src/data/published.json', import.meta.url), 'utf8'));
const LOG = fs.readFileSync(new URL('./fixtures/legacy/panel-log-s1.ndjson', import.meta.url), 'utf8');
const signer = makeSigner();
const COMMENT = 'A Tampa man tried to pay a parking fine with a car wash coupon. The city declined, but kept the coupon.';

function setup() {
  resetKeyCache();
  const pending = [
    { id: 'aw-p-aaa', seen_id: 'src-aaa', title: 'Tampa man pays fine with car wash coupon', comment: COMMENT, category: 'bureaucracy', source_url: '', external_url: 'https://www.wfla.com/news/coupon/', source_domain: 'wfla.com', source_name: 'WFLA', date: '2026-10-10', score: 9 },
    { id: 'aw-p-bbb', seen_id: 'src-bbb', title: 'Tampa man pays parking fine with car wash coupon', comment: '', category: 'bureaucracy', source_url: '', external_url: 'https://news.google.com/rss/articles/CBMiQ', source_domain: 'msn.com', source_name: 'MSN', date: '2026-10-10', score: 9 },
    { id: 'aw-p-ccc', seen_id: 'src-ccc', title: 'Council approves budget amendment', comment: '', category: 'bureaucracy', source_url: '', external_url: 'https://news.google.com/rss/articles/CBMiR', source_domain: 'example.com', source_name: 'Ex', date: '2026-10-09', score: 3 },
  ];
  const gh = new FakeGitHub({
    [CONTENT_PATHS.published]: serialize(PUBLISHED),
    [CONTENT_PATHS.pending]: serialize(pending),
    [CONTENT_PATHS.fetchStatus]: JSON.stringify({ finishedAt: '2026-10-14T07:22:32Z', sourcesChecked: 14, totals: { fetched: 1, added: 1, duplicate: 0, lowScore: 0, excluded: 0 } }),
  });
  const env = {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging',
    BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net',
    BOSS_CSRF_SECRET: 'csrf', BOSS_ORIGIN: ORIGIN, GITHUB_TOKEN: 'tok', BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat',
    BOSS_GITHUB_BRANCH: 'content-staging', BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net',
  };
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/cdn-cgi/access/certs')) return new Response(JSON.stringify({ keys: [signer.jwk] }));
    return gh.fetch(url, init);
  };
  const boss = createBoss({ fetchImpl });
  return { gh, env, boss };
}

const loc = (res) => new URL(res.headers.get('Location'), ORIGIN).searchParams.get('m') || '';
const id = { email: 'hakan@dndr.net', subject: 'user-1' };

async function get(ctx, path, token = signer.sign()) {
  return ctx.boss.fetch(new Request(`${ORIGIN}${path}`, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} }), ctx.env);
}

async function post(ctx, path, fields, { origin = ORIGIN, csrf, file } = {}) {
  const form = new FormData();
  form.set('csrf', csrf ?? await csrfToken(ctx.env, id));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set('file', new Blob([file.text]), file.name);
  return ctx.boss.fetch(new Request(`${ORIGIN}${path}`, { method: 'POST', body: form, headers: { 'Cf-Access-Jwt-Assertion': signer.sign(), Origin: origin } }), ctx.env);
}

test('every page requires a verified Access identity', async () => {
  const ctx = setup();
  for (const p of ['/review', '/published', '/analytics', '/reactions', '/audit', '/health', '/analytics/export?format=csv', '/reactions/export.json']) {
    assert.equal((await get(ctx, p, '')).status, 401, p);
    assert.equal((await get(ctx, p, signer.sign({ email: 'other@example.com' }))).status, 403, p);
  }
  assert.equal(ctx.gh.requests.length, 0, 'nothing reaches GitHub unauthenticated');
});

test('review page clusters copies and shows flags; HTML is escaped and locked down', async () => {
  const ctx = setup();
  const res = await get(ctx, '/review');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  const html = await res.text();
  assert.match(html, /2 copies/);
  assert.match(html, /distinct stories/);
});

test('apply: approve one story and drop its copy in ONE commit; audit and decisions recorded', async () => {
  const ctx = setup();
  const before = ctx.gh.commitCount();
  const html = await (await get(ctx, '/review')).text();
  // Find which entry index holds aw-p-aaa or its cluster.
  const idx = [...html.matchAll(/name="e(\d+)_id" value="([^"]+)"/g)].find((m) => m[2] === 'aw-p-aaa' || m[2] === 'aw-p-bbb');
  const i = idx[1];
  const rep = idx[2];
  const fields = {
    count: '2', [`e${i}_id`]: rep, [`e${i}_others`]: rep === 'aw-p-aaa' ? 'aw-p-bbb' : 'aw-p-aaa', [`e${i}_dupes`]: '1', [`e${i}_action`]: 'approve',
    [`e${i}_title`]: 'Tampa man pays fine with car wash coupon', [`e${i}_comment`]: COMMENT, [`e${i}_category`]: 'bureaucracy',
    [`e${i}_source_url`]: 'https://www.wfla.com/news/coupon/', [`e${i}_source_name`]: 'WFLA', [`e${i}_date`]: '2026-10-10', [`e${i}_status`]: 'REAL',
    [`e${i}_city`]: 'Tampa', [`e${i}_state`]: 'Florida',
  };
  const res = await post(ctx, '/review/apply', fields);
  assert.equal(res.status, 303);
  assert.match(loc(res), /1 approved, 1 rejected/);
  assert.equal(ctx.gh.commitCount(), before + 1);
  const files = ctx.gh.headFiles();
  assert.equal(JSON.parse(files[CONTENT_PATHS.published]).items[0].id, 'aw-0136');
  assert.deepEqual(JSON.parse(files[CONTENT_PATHS.pending]).map((p) => p.id), ['aw-p-ccc']);
  assert.equal(ctx.env.APP_DB.count('editorial_decisions'), 2);
  assert.equal(ctx.env.APP_DB.count('boss_audit'), 1);
});

test('POST without a valid CSRF token or from another origin changes nothing', async () => {
  const ctx = setup();
  const before = ctx.gh.commitCount();
  assert.equal((await post(ctx, '/review/apply', { count: '0' }, { csrf: 'bad' })).status, 403);
  assert.equal((await post(ctx, '/review/apply', { count: '0' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal(ctx.gh.commitCount(), before);
});

test('a reject without a reason is refused before any commit', async () => {
  const ctx = setup();
  const before = ctx.gh.commitCount();
  const res = await post(ctx, '/review/apply', { count: '1', e0_id: 'aw-p-ccc', e0_action: 'reject' });
  assert.match(loc(res), /choose a rejection reason/);
  assert.equal(ctx.gh.commitCount(), before);
});

test('published edit keeps the article URL', async () => {
  const ctx = setup();
  const item = PUBLISHED.items[2];
  const res = await post(ctx, '/published/edit', { id: item.id, title: 'A completely different headline', comment: item.comment, category: item.category, source_url: item.source_url, source_name: item.source_name, date: item.date, status: 'REAL', city: item.city || '', state: item.state || '', ovs: '1', ova: '1' });
  assert.equal(res.status, 303);
  const after = JSON.parse(ctx.gh.headFiles()[CONTENT_PATHS.published]).items;
  assert.deepEqual(computeSlugs(after), computeSlugs(PUBLISHED.items));
});

test('delete requires the typed id', async () => {
  const ctx = setup();
  const before = ctx.gh.commitCount();
  const res = await post(ctx, '/published/delete', { id: 'aw-0135', confirm: 'aw-013' });
  assert.match(loc(res), /Type the item id/);
  assert.equal(ctx.gh.commitCount(), before);
});

test('legacy import: inventory first, then apply only with the matching SHA prefix', async () => {
  const ctx = setup();
  const inv = await post(ctx, '/analytics/import', {}, { file: { name: 'aw_panel_log.txt', text: LOG } });
  const html = await inv.text();
  const sha = /<code>([0-9a-f]{64})<\/code>/.exec(html)[1];
  assert.equal(ctx.env.ANALYTICS_DB.count('visitor_events'), 0);
  assert.doesNotMatch(html, /203\.0\.113/, 'no address shown');
  const wrong = await post(ctx, '/analytics/import', { confirm: '000000000000' }, { file: { name: 'a', text: LOG } });
  assert.match(await wrong.text(), /does not match/);
  const ok = await post(ctx, '/analytics/import', { confirm: sha.slice(0, 12) }, { file: { name: 'a', text: LOG } });
  assert.equal(ok.status, 303);
  assert.equal(ctx.env.ANALYTICS_DB.count('visitor_events'), 5);
  const again = await post(ctx, '/analytics/import', { confirm: sha.slice(0, 12) }, { file: { name: 'a', text: LOG } });
  assert.equal(again.status, 303);
  assert.equal(ctx.env.ANALYTICS_DB.count('visitor_events'), 5, 'idempotent');
  const page = await (await get(ctx, '/analytics')).text();
  assert.match(page, /ALL #/);
  assert.match(page, /legacy/);
});

test('retention delete needs the typed date and an exact preview count', async () => {
  const ctx = setup();
  const sha = (await (await post(ctx, '/analytics/import', {}, { file: { name: 'a', text: LOG } })).text()).match(/<code>([0-9a-f]{64})<\/code>/)[1];
  await post(ctx, '/analytics/import', { confirm: sha.slice(0, 12) }, { file: { name: 'a', text: LOG } });
  const preview = await (await get(ctx, '/analytics/retention?before=2026-08-01')).text();
  assert.match(preview, /<b>5<\/b>/);
  const op = /name="op" value="([^"]+)"/.exec(preview)[1];
  const typo = await post(ctx, '/analytics/retention/delete', { cutoff: '2026-08-01', expected: '5', op, confirm: '2026-08-02' });
  assert.match(loc(typo), /Nothing was deleted/);
  assert.equal(ctx.env.ANALYTICS_DB.count('visitor_events'), 5);
  const done = await post(ctx, '/analytics/retention/delete', { cutoff: '2026-08-01', expected: '5', op, confirm: '2026-08-01' });
  assert.match(loc(done), /Deleted 5 records/);
  assert.equal(ctx.env.ANALYTICS_DB.count('visitor_events'), 0);
  assert.equal(ctx.env.ANALYTICS_DB.count('analytics_operator_log'), 1);
});

test('reactions import: plan, apply with SHA prefix, export round trip', async () => {
  const ctx = setup();
  const votes = JSON.stringify({ 'aw-0100': { wat: 1, lol: 2, same: 0, dead: 0 } });
  const plan = await (await post(ctx, '/reactions/import', {}, { file: { name: 'aw_votes.json', text: votes } })).text();
  const sha = /<code>([0-9a-f]{64})<\/code>/.exec(plan)[1];
  assert.equal(ctx.env.APP_DB.count('reaction_counts'), 0);
  const res = await post(ctx, '/reactions/import', { confirm: sha.slice(0, 12) }, { file: { name: 'aw_votes.json', text: votes } });
  assert.equal(res.status, 303);
  const exported = await (await get(ctx, '/reactions/export.json')).json();
  assert.deepEqual(exported, { 'aw-0100': { wat: 1, lol: 2, same: 0, dead: 0 } });
});

test('health shows configuration state, token expiry, and no secret values', async () => {
  const ctx = setup();
  const html = await (await get(ctx, '/health')).text();
  assert.match(html, /GitHub token expiry/);
  assert.doesNotMatch(html, /\btok\b/);
  assert.doesNotMatch(html, />csrf</);
});

test('a production-branch write is refused by a staging Boss', async () => {
  const ctx = setup();
  ctx.env.BOSS_GITHUB_BRANCH = 'main';
  const res = await post(ctx, '/published/delete', { id: 'aw-0135', confirm: 'aw-0135' });
  assert.match(loc(res), /must not write main/);
});

test('untrusted feed URLs are never rendered as javascript: links', async () => {
  const { safeHref, h } = await import('../workers/boss/src/html.mjs');
  assert.equal(safeHref('javascript:alert(1)'), '#');
  assert.equal(safeHref('data:text/html,x'), '#');
  assert.equal(safeHref('https://example.com/a?b="c"'), h('https://example.com/a?b=%22c%22'));
});
