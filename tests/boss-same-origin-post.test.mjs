// Regression: production Boss form POSTs (Reactions import) were refused with
// "Cross-origin request refused." Boss pages sent `Referrer-Policy: no-referrer`;
// under that policy browsers serialize the Origin of every non-GET request as
// "null", even for a same-origin form (verified in Chromium 2026-10-16:
// Origin "null", Sec-Fetch-Site "same-origin"). checkCsrf requires Origin to equal
// BOSS_ORIGIN, so every legitimate POST failed. The pages now send `same-origin`,
// which keeps referrers away from other sites and lets the browser send the real
// origin to Boss itself. The Origin check is unchanged and still strict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoss } from '../workers/boss/src/index.mjs';
import { resetKeyCache } from '../workers/boss/src/auth.mjs';
import { csrfToken } from '../workers/boss/src/csrf.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { AUD, TEAM, makeSigner } from './helpers/access-jwt.mjs';

const ORIGIN = 'https://boss.americawhat.com';
const signer = makeSigner();
const id = { email: 'hakan@dndr.net', subject: 'user-1' };
const VOTES = JSON.stringify({ 'aw-0011': { wat: 2, lol: 1, same: 0, dead: 0 }, 'aw-0012': { wat: 0, lol: 0, same: 3, dead: 1 } });

/** The Origin a browser sends for a form POST (Fetch "serialize a request origin", POST branch). */
export function browserPostOrigin(referrerPolicy, pageOrigin, targetOrigin) {
  const policy = String(referrerPolicy || 'strict-origin-when-cross-origin').toLowerCase();
  if (policy === 'no-referrer') return 'null';
  if (policy === 'same-origin') return pageOrigin === targetOrigin ? pageOrigin : 'null';
  return pageOrigin; // every other policy keeps an https origin for an https target
}

function setup() {
  resetKeyCache();
  const env = {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'production',
    BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net',
    BOSS_CSRF_SECRET: 'csrf-test', BOSS_ORIGIN: ORIGIN, GITHUB_TOKEN: 'tok',
    BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat', BOSS_GITHUB_BRANCH: 'main',
    BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net',
  };
  const fetchImpl = async (url) => {
    if (String(url).includes('/cdn-cgi/access/certs')) return new Response(JSON.stringify({ keys: [signer.jwk] }));
    throw new Error(`unexpected fetch ${url}`);
  };
  return { env, boss: createBoss({ fetchImpl }) };
}

async function page(ctx, path = '/reactions') {
  return ctx.boss.fetch(new Request(`${ORIGIN}${path}`, { headers: { 'Cf-Access-Jwt-Assertion': signer.sign() } }), ctx.env);
}

async function importPost(ctx, { origin, site = 'same-origin', csrf, confirm = '', jwt = signer.sign(), omitOrigin = false } = {}) {
  const form = new FormData();
  form.set('csrf', csrf ?? await csrfToken(ctx.env, id));
  if (confirm) form.set('confirm', confirm);
  form.set('file', new Blob([VOTES], { type: 'application/json' }), 'aw_votes.json');
  const headers = { 'Cf-Access-Jwt-Assertion': jwt };
  if (!omitOrigin) headers.Origin = origin;
  if (site) headers['Sec-Fetch-Site'] = site;
  return ctx.boss.fetch(new Request(`${ORIGIN}/reactions/import`, { method: 'POST', body: form, headers }), ctx.env);
}

const votes = async (env) => (await env.APP_DB.prepare('SELECT COALESCE(SUM(count),0) n FROM reaction_counts').first()).n;

test('Boss pages use a referrer policy under which same-origin form POSTs carry the real Origin', async () => {
  const ctx = setup();
  for (const res of [await page(ctx), await page(ctx, '/analytics'), await ctx.boss.fetch(new Request(`${ORIGIN}/reactions`), ctx.env)]) {
    const policy = res.headers.get('Referrer-Policy');
    assert.equal(policy, 'same-origin');
    assert.equal(browserPostOrigin(policy, ORIGIN, ORIGIN), ORIGIN);
    assert.equal(browserPostOrigin(policy, ORIGIN, 'https://example.com'), 'null', 'no origin leaks to other sites');
  }
  // The former policy is exactly what produced the production failure.
  assert.equal(browserPostOrigin('no-referrer', ORIGIN, ORIGIN), 'null');
});

test('the Reactions import works end to end with the Origin the browser now sends', async () => {
  const ctx = setup();
  const policy = (await page(ctx)).headers.get('Referrer-Policy');
  const origin = browserPostOrigin(policy, ORIGIN, ORIGIN);

  const preview = await importPost(ctx, { origin });
  assert.equal(preview.status, 200);
  const html = await preview.text();
  const sha = /data-sha256="([0-9a-f]{64})"|\b([0-9a-f]{64})\b/.exec(html);
  assert.ok(sha, 'the preview shows the snapshot SHA-256 to confirm');
  assert.equal(await votes(ctx.env), 0, 'preview imports nothing');

  const done = await importPost(ctx, { origin, confirm: (sha[1] || sha[2]).slice(0, 16) });
  assert.equal(done.status, 303);
  assert.match(new URL(done.headers.get('Location'), ORIGIN).searchParams.get('m'), /baseline import applied: \+7 votes/);
  assert.equal(await votes(ctx.env), 7);

  const again = await importPost(ctx, { origin, confirm: (sha[1] || sha[2]).slice(0, 16) });
  assert.equal(again.status, 200);
  assert.equal(await votes(ctx.env), 7, 'the same snapshot is never applied twice');
});

test('forged and cross-origin import POSTs are still refused and import nothing', async () => {
  const ctx = setup();
  const cases = [
    ['Origin null (old policy / opaque origin)', { origin: 'null' }, 403, /Cross-origin request refused/],
    ['foreign Origin', { origin: 'https://evil.example' }, 403, /Cross-origin request refused/],
    ['look-alike Origin', { origin: 'https://boss.americawhat.com.evil.example' }, 403, /Cross-origin request refused/],
    ['http downgrade', { origin: 'http://boss.americawhat.com' }, 403, /Cross-origin request refused/],
    ['missing Origin', { omitOrigin: true }, 403, /Cross-origin request refused/],
    ['cross-site fetch metadata', { origin: ORIGIN, site: 'cross-site' }, 403, /Cross-site request refused/],
    ['same-site fetch metadata', { origin: ORIGIN, site: 'same-site' }, 403, /Cross-site request refused/],
    ['bad CSRF token', { origin: ORIGIN, csrf: 'f'.repeat(64) }, 403, /Invalid or expired form token/],
    ['no Access assertion', { origin: ORIGIN, jwt: '' }, 401, null],
    ['another identity', { origin: ORIGIN, jwt: signer.sign({ email: 'someone@example.com' }) }, 403, null],
  ];
  for (const [label, opts, status, message] of cases) {
    const res = await importPost(ctx, opts);
    assert.equal(res.status, status, label);
    if (message) assert.match(await res.text(), message, label);
  }
  assert.equal(await votes(ctx.env), 0);
});
