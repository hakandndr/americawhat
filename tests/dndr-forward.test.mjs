import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import worker from '../workers/web/src/index.mjs';
import { RETRY_MAX_ATTEMPTS, RETRY_WINDOW_SECONDS, forwardingEnabled, retryOutbox } from '../workers/web/src/dndr-forward.mjs';
import { checkTargetConfig } from '../scripts/release/cf-release.mjs';

const ORIGIN = 'https://americawhat.com';
let seq = 0;
const uuid = () => `0b3e7a52-8f1c-4c3a-9d2e-${String(++seq).padStart(12, '0')}`;

/** A fake DNDR ProducerApi with DNDR's own idempotency: one row per producer event id. */
function fakeDndr({ fail = 0, throwing = false } = {}) {
  const stored = new Map();
  let failures = fail;
  return {
    stored,
    calls: 0,
    async recordPage(event) {
      this.calls += 1;
      if (throwing) throw new Error('collector unavailable');
      if (failures > 0) { failures -= 1; return { status: 'error', reason: 'write_failed' }; }
      if (stored.has(event.producerEventId)) return { status: 'duplicate' };
      stored.set(event.producerEventId, event);
      return { status: 'accepted' };
    },
  };
}

function setup(over = {}) {
  return {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(),
    ASSETS: { fetch: async () => new Response('asset') },
    ENVIRONMENT: 'production', PUBLIC_ORIGINS: `${ORIGIN},https://www.americawhat.com`, SITE_HOSTNAME: 'americawhat.com',
    REACTION_GUARD_SECRET: 'secret', ...over,
  };
}

async function visit(env, evt, path = '/item/example/', ip = '203.0.113.9') {
  const ctx = { pending: [], waitUntil(p) { this.pending.push(p); } };
  const res = await worker.fetch(new Request(`${ORIGIN}/analytics/log_df.php`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip, 'User-Agent': 'Mozilla/5.0 Chrome/130.0' },
    body: `path=${encodeURIComponent(path)}&referrer=&evt=${evt}`,
  }), env, ctx);
  await Promise.all(ctx.pending);
  return res;
}

const outbox = (env) => env.ANALYTICS_DB.sqlite.prepare('SELECT event_uid, state, attempts FROM dndr_outbox ORDER BY event_uid').all();
const age = (env, seconds) => {
  env.ANALYTICS_DB.sqlite.prepare('UPDATE dndr_outbox SET updated_at = updated_at - ?').run(seconds);
  env.ANALYTICS_DB.sqlite.prepare('UPDATE visitor_events SET occurred_at = occurred_at - ?').run(seconds);
};
const now = () => Math.floor(Date.now() / 1000);

test('a stored production page view is copied once, with the event_uid as producer id and the same path', async () => {
  const dndr = fakeDndr();
  const env = setup({ DNDR_COLLECTOR: dndr });
  const evt = uuid();
  assert.equal((await visit(env, evt, '/item/a-story/')).status, 200);
  const [row] = env.ANALYTICS_DB.sqlite.prepare('SELECT event_uid, path FROM visitor_events').all();
  assert.equal(dndr.stored.size, 1);
  const sent = dndr.stored.get(row.event_uid);
  assert.equal(sent.producerEventId, `aw:${evt}`);
  assert.equal(sent.path, row.path);
  assert.equal(sent.hostname, 'americawhat.com');
  assert.ok(!('producerId' in sent), 'the producer identity comes from the binding props, never the event');
  assert.deepEqual(outbox(env).map((r) => r.state), ['sent']);
});

test('a repeated beacon or a retry never produces a second DNDR page view', async () => {
  const dndr = fakeDndr();
  const env = setup({ DNDR_COLLECTOR: dndr });
  const evt = uuid();
  await visit(env, evt);
  await visit(env, evt); // same event id: the source row is a duplicate, nothing is forwarded
  assert.equal(env.ANALYTICS_DB.count('visitor_events'), 1);
  assert.equal(dndr.calls, 1);
  // Force a resend of the already-delivered row: DNDR answers duplicate, the outbox stays sent.
  env.ANALYTICS_DB.sqlite.prepare("UPDATE dndr_outbox SET state = 'failed'").run();
  age(env, 600);
  assert.equal(await retryOutbox(env, env.ANALYTICS_DB, now(), 'americawhat.com'), 1);
  assert.equal(dndr.stored.size, 1);
  assert.deepEqual(outbox(env).map((r) => r.state), ['sent']);
});

test('DNDR unavailable: the visitor is answered, the AmericaWhat row is kept and the outbox records the failure', async () => {
  const env = setup({ DNDR_COLLECTOR: fakeDndr({ throwing: true }) });
  const res = await visit(env, uuid());
  assert.equal(res.status, 200);
  assert.equal(env.ANALYTICS_DB.count('visitor_events'), 1);
  const [row] = outbox(env);
  assert.equal(row.state, 'failed');
  assert.equal(row.attempts, 1);
});

test('outbox recovery resends recent failures once DNDR is back, in bounded order', async () => {
  const dndr = fakeDndr({ fail: 4 }); // first two visits fail (two attempts each)
  const env = setup({ DNDR_COLLECTOR: dndr });
  await visit(env, uuid(), '/one/', '203.0.113.1');
  await visit(env, uuid(), '/two/', '203.0.113.2');
  assert.deepEqual(outbox(env).map((r) => r.state), ['failed', 'failed']);
  assert.equal(await retryOutbox(env, env.ANALYTICS_DB, now(), 'americawhat.com'), 0, 'fresh rows wait for their own request first');
  age(env, 600);
  // The cron entry point runs the same recovery.
  const ctx = { pending: [], waitUntil(p) { this.pending.push(p); } };
  await worker.scheduled({}, env, ctx);
  await Promise.all(ctx.pending);
  assert.deepEqual(outbox(env).map((r) => r.state), ['sent', 'sent']);
  assert.deepEqual([...dndr.stored.values()].map((e) => e.path).sort(), ['/one/', '/two/']);
});

test('recovery leaves rows outside the retry window or past the attempt limit untouched', async () => {
  const dndr = fakeDndr({ throwing: true });
  const env = setup({ DNDR_COLLECTOR: dndr });
  await visit(env, uuid(), '/old/', '203.0.113.3');
  age(env, RETRY_WINDOW_SECONDS + 60);
  await visit(env, uuid(), '/tired/', '203.0.113.4');
  env.ANALYTICS_DB.sqlite.prepare("UPDATE dndr_outbox SET attempts = ? WHERE state = 'failed' AND attempts = 1 AND updated_at > ?").run(RETRY_MAX_ATTEMPTS, now() - 300);
  age(env, 600);
  const calls = dndr.calls;
  assert.equal(await retryOutbox(env, env.ANALYTICS_DB, now(), 'americawhat.com'), 0);
  assert.equal(dndr.calls, calls);
});

test('staging and local previews never forward, even with a binding present', async () => {
  for (const ENVIRONMENT of ['staging', 'local', '']) {
    const dndr = fakeDndr();
    const env = setup({ ENVIRONMENT, COLLECT_VISITS: 'all', DNDR_COLLECTOR: dndr });
    assert.equal(forwardingEnabled(env), false);
    await visit(env, uuid());
    assert.equal(env.ANALYTICS_DB.count('visitor_events'), 1);
    assert.equal(env.ANALYTICS_DB.count('dndr_outbox'), 0);
    assert.equal(await retryOutbox(env, env.ANALYTICS_DB, now(), 'americawhat.com'), 0);
    assert.equal(dndr.calls, 0, ENVIRONMENT);
  }
  // Production without the binding queues nothing either.
  const env = setup();
  await visit(env, uuid());
  assert.equal(env.ANALYTICS_DB.count('dndr_outbox'), 0);
});

test('config: only production Web binds DNDR, exactly as prd_americawhat_native; staging binds nothing', () => {
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const configs = { web: read('workers/web/wrangler.jsonc'), boss: read('workers/boss/wrangler.jsonc') };
  assert.deepEqual(configs.web.env.production.services, [{ binding: 'DNDR_COLLECTOR', service: 'dndr-collector', entrypoint: 'ProducerApi', props: { producerId: 'prd_americawhat_native' } }]);
  assert.equal(configs.web.services, undefined);
  assert.equal(configs.web.triggers, undefined);
  assert.deepEqual(checkTargetConfig('production', configs).errors, []);
  assert.deepEqual(checkTargetConfig('staging', configs).errors, []);
  const tampered = structuredClone(configs);
  tampered.web.env.production.services[0].props.producerId = 'prd_other_site';
  assert.ok(checkTargetConfig('production', tampered).errors.some((e) => /prd_americawhat_native/.test(e)));
  const leaky = structuredClone(configs);
  leaky.web.services = configs.web.env.production.services;
  assert.ok(checkTargetConfig('staging', leaky).errors.some((e) => /staging must not bind/.test(e)));
});

test('deploy applies only the Web cron schedules (never routes) and a failure there cannot roll back a release', () => {
  const text = fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
  const step = text.slice(text.indexOf('- name: Apply Web cron schedules'), text.indexOf('- name: Roll back on failure'));
  assert.match(step, /continue-on-error: true/);
  assert.match(step, /cf-release\.mjs schedules "\$\{\{ needs\.plan\.outputs\.target \}\}"/);
  assert.match(step, /\/workers\/scripts\/\$WEB\/schedules"/);
  assert.doesNotMatch(text.replace(/^\s*#.*$/gm, ''), /triggers deploy|\/routes|\/domains/);
});
