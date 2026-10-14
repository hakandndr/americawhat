import test from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import worker from '../workers/web/src/index.mjs';
import { buildNativeEvent, storeNativeEvent, RATE_MAX_EVENTS } from '../workers/web/src/collector.mjs';
import published from '../src/data/published.json' with { type: 'json' };

const ORIGIN = 'https://americawhat-web-staging.example.workers.dev';
const PUBLISHED_ID = (published.items || published)[0].id;
const UUID = '0b3e7a52-8f1c-4c3a-9d2e-5f6a7b8c9d0e';

function makeEnv(over = {}) {
  const assetsCalls = [];
  return {
    env: {
      APP_DB: D1Sqlite.app(),
      ANALYTICS_DB: D1Sqlite.analytics(),
      ASSETS: { fetch: async (req) => { assetsCalls.push(new URL(req.url).pathname); return new Response('asset', { status: 200 }); } },
      ENVIRONMENT: 'staging',
      PUBLIC_ORIGINS: ORIGIN,
      REACTION_GUARD_SECRET: 'secret',
      COLLECT_VISITS: 'all',
      SITE_HOSTNAME: 'americawhat.com',
      ...over,
    },
    assetsCalls,
  };
}

const ctx = { pending: [], waitUntil(p) { this.pending.push(p); } };

function req(path, { method = 'GET', body, origin = ORIGIN, type = 'application/x-www-form-urlencoded', headers = {} } = {}) {
  const h = { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36', ...headers };
  if (origin) h.Origin = origin;
  if (body !== undefined) h['Content-Type'] = type;
  return new Request(`https://americawhat-web-staging.example.workers.dev${path}`, { method, headers: h, body });
}

test('static pages fall through to assets with a staging noindex header', async () => {
  const { env, assetsCalls } = makeEnv();
  const res = await worker.fetch(req('/about/'), env, ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(assetsCalls, ['/about/']);
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});

test('production does not add noindex', async () => {
  const { env } = makeEnv({ ENVIRONMENT: 'production' });
  const res = await worker.fetch(req('/'), env, ctx);
  assert.equal(res.headers.get('X-Robots-Tag'), null);
});

test('PHP, logs and JSON under /analytics are never served', async () => {
  const { env, assetsCalls } = makeEnv();
  for (const p of ['/analytics/aw_votes.json', '/analytics/aw_panel_log.txt', '/analytics/tracker.php', '/analytics/', '/api/nope']) {
    const res = await worker.fetch(req(p), env, ctx);
    assert.equal(res.status, 404, p);
  }
  assert.equal(assetsCalls.length, 0);
});

test('vote.php compatibility: POST counts, GET is refused', async () => {
  const { env } = makeEnv();
  const get = await worker.fetch(req(`/analytics/vote.php?id=${PUBLISHED_ID}&reaction=lol`), env, ctx);
  assert.equal(get.status, 405);
  assert.equal(env.APP_DB.count('reaction_counts'), 0);
  const post = await worker.fetch(req('/analytics/vote.php', { method: 'POST', body: `id=${PUBLISHED_ID}&reaction=lol` }), env, ctx);
  assert.equal(post.status, 200);
  const data = await post.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.counts.lol, 1);
  const read = await worker.fetch(req(`/analytics/get_votes.php?ids=${PUBLISHED_ID}`), env, ctx);
  assert.deepEqual(await read.json(), { [PUBLISHED_ID]: { wat: 0, lol: 1, same: 0, dead: 0 } });
});

test('cross-origin or origin-less writes are refused', async () => {
  const { env } = makeEnv();
  const evil = await worker.fetch(req('/api/reactions', { method: 'POST', body: `id=${PUBLISHED_ID}&reaction=wat`, origin: 'https://evil.example' }), env, ctx);
  assert.equal(evil.status, 403);
  const none = await worker.fetch(req('/api/reactions', { method: 'POST', body: `id=${PUBLISHED_ID}&reaction=wat`, origin: null }), env, ctx);
  assert.equal(none.status, 403);
  assert.equal(env.APP_DB.count('reaction_counts'), 0);
});

test('log_df.php: POST stores one native row, GET stores nothing', async () => {
  const { env } = makeEnv();
  const get = await worker.fetch(req('/analytics/log_df.php?path=/&referrer='), env, ctx);
  assert.equal(get.status, 204);
  assert.equal(env.ANALYTICS_DB.count('visitor_events'), 0);
  const body = `path=%2Fitem%2Fx%2F&referrer=https%3A%2F%2Fwww.google.com%2F&evt=${UUID}`;
  const post = await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body }), env, ctx);
  assert.equal(post.status, 200);
  const retry = await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body }), env, ctx);
  assert.equal(retry.status, 200);
  assert.equal(env.ANALYTICS_DB.count('visitor_events'), 1, 'a retried beacon is stored once');
  const row = env.ANALYTICS_DB.sqlite.prepare('SELECT * FROM visitor_events').get();
  assert.equal(row.origin, 'native');
  assert.equal(row.event_uid, `aw:${UUID}`);
  assert.equal(row.page, '/item/x/');
  assert.equal(row.referrer, 'Google');
  assert.equal(row.automation, 'human');
  assert.equal(row.ip, '203.0.113.9');
});

test('/api/pv JSON beacon validates path and event id', async () => {
  const { env } = makeEnv();
  const bad = await worker.fetch(req('/api/pv', { method: 'POST', type: 'application/json', body: JSON.stringify({ evt: 'x', path: '/' }) }), env, ctx);
  assert.equal(bad.status, 400);
  const badPath = await worker.fetch(req('/api/pv', { method: 'POST', type: 'application/json', body: JSON.stringify({ evt: UUID, path: '//evil' }) }), env, ctx);
  assert.equal(badPath.status, 400);
  const ok = await worker.fetch(req('/api/pv', { method: 'POST', type: 'application/json', body: JSON.stringify({ evt: UUID, path: '/' }) }), env, ctx);
  assert.equal(ok.status, 200);
});

test('crawler user agents are classified as automated', () => {
  const built = buildNativeEvent({ body: { evt: UUID, path: '/' }, ip: '66.249.66.1', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)', cf: { country: 'US' }, now: 1791976000 });
  assert.equal(built.row.automation, 'automated');
  assert.equal(built.row.source_label, 'Googlebot');
  assert.equal(built.row.country, 'United States');
});

test('per-address rate limit drops excess events without failing the visitor', async () => {
  const db = D1Sqlite.analytics();
  const now = 1791976000;
  for (let i = 0; i < RATE_MAX_EVENTS; i++) {
    const evt = `0b3e7a52-8f1c-4c3a-9d2e-${String(i).padStart(12, '0')}`;
    const { row } = buildNativeEvent({ body: { evt, path: '/' }, ip: '198.51.100.1', userAgent: 'x', cf: {}, now });
    assert.equal(await storeNativeEvent(db, row), 'stored');
  }
  const { row } = buildNativeEvent({ body: { evt: UUID, path: '/' }, ip: '198.51.100.1', userAgent: 'x', cf: {}, now });
  assert.equal(await storeNativeEvent(db, row), 'rate_limited');
});

test('DNDR forwarding: source row first, outbox records the outcome, failure never blocks', async () => {
  const calls = [];
  const collector = { recordPage: async (e) => { calls.push(e); return { status: 'accepted' }; } };
  const { env } = makeEnv({ DNDR_COLLECTOR: collector });
  const c = { pending: [], waitUntil(p) { this.pending.push(p); } };
  const body = `path=%2F&referrer=&evt=${UUID}`;
  await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body }), env, c);
  await Promise.all(c.pending);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].producerEventId, `aw:${UUID}`);
  assert.equal(env.ANALYTICS_DB.sqlite.prepare('SELECT state FROM dndr_outbox').get().state, 'sent');

  const failing = { recordPage: async () => { throw new Error('down'); } };
  const second = makeEnv({ DNDR_COLLECTOR: failing });
  const c2 = { pending: [], waitUntil(p) { this.pending.push(p); } };
  const res = await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body }), second.env, c2);
  await Promise.all(c2.pending);
  assert.equal(res.status, 200);
  assert.equal(second.env.ANALYTICS_DB.count('visitor_events'), 1);
  assert.equal(second.env.ANALYTICS_DB.sqlite.prepare('SELECT state FROM dndr_outbox').get().state, 'failed');
});

test('without a DNDR binding nothing is queued', async () => {
  const { env } = makeEnv();
  await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body: `path=%2F&evt=${UUID}` }), env, ctx);
  assert.equal(env.ANALYTICS_DB.count('dndr_outbox'), 0);
});

test('health reports checks without secrets', async () => {
  const { env } = makeEnv({ REACTION_GUARD_SECRET: 's3cr3t-value-xyz' });
  const res = await worker.fetch(req('/api/health'), env, ctx);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.checks.app_db, 'ok');
  assert.ok(!JSON.stringify(data).includes('s3cr3t-value-xyz'));
  const { env: env2 } = makeEnv({ REACTION_GUARD_SECRET: '' });
  assert.equal((await worker.fetch(req('/api/health'), env2, ctx)).status, 503);
});

test('trailing-slash redirects from assets become 301; other redirects pass through', async () => {
  const { permanentSlashRedirect } = await import('../workers/web/src/index.mjs');
  const r = (loc, status = 307) => new Response(null, { status, headers: { Location: loc } });
  const a = permanentSlashRedirect(new Request('https://americawhat.com/about'), r('https://americawhat.com/about/'));
  assert.equal(a.status, 301);
  assert.equal(a.headers.get('Location'), '/about/');
  const q = permanentSlashRedirect(new Request('https://americawhat.com/item/x?utm=1'), r('/item/x/?utm=1'));
  assert.equal(q.status, 301);
  assert.equal(permanentSlashRedirect(new Request('https://americawhat.com/a'), r('https://evil.example/a/')).status, 307);
  assert.equal(permanentSlashRedirect(new Request('https://americawhat.com/a'), r('/b/')).status, 307);
  assert.equal(permanentSlashRedirect(new Request('https://americawhat.com/a/'), new Response('ok')).status, 200);
});

test('staging stores no real visitor: only requests with the staging test key are recorded', async () => {
  const { env } = makeEnv({ COLLECT_VISITS: undefined, STAGING_TEST_KEY: 'k-123' });
  const body = `path=%2F&evt=${UUID}`;
  const anon = await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body }), env, ctx);
  assert.equal(anon.status, 202);
  assert.equal(env.ANALYTICS_DB.count('visitor_events'), 0);
  const wrong = await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body, headers: { 'X-AW-Test-Key': 'nope' } }), env, ctx);
  assert.equal(wrong.status, 202);
  const ok = await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body, headers: { 'X-AW-Test-Key': 'k-123' } }), env, ctx);
  assert.equal(ok.status, 200);
  assert.equal(env.ANALYTICS_DB.count('visitor_events'), 1);
  // Without a configured key nothing is ever stored outside production.
  const { env: env2 } = makeEnv({ COLLECT_VISITS: undefined });
  await worker.fetch(req('/analytics/log_df.php', { method: 'POST', body, headers: { 'X-AW-Test-Key': '' } }), env2, ctx);
  assert.equal(env2.ANALYTICS_DB.count('visitor_events'), 0);
  // Production collects by default.
  const { visitCollectionAllowed } = await import('../workers/web/src/index.mjs');
  assert.equal(visitCollectionAllowed(new Request('https://americawhat.com/'), { ENVIRONMENT: 'production' }), true);
});

test('staging config binds no DNDR collector and production config has none yet', async () => {
  const fs = await import('node:fs');
  const cfg = fs.readFileSync(new URL('../workers/web/wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(cfg, /"services"\s*:/);
  assert.doesNotMatch(cfg, /DNDR_COLLECTOR/);
});
