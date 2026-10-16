// The D1 migration gate that works without any D1 API permission.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS, schemaDigest } from '../workers/shared/schema.mjs';
import { repoMigrations, schemaGate } from '../scripts/release/cf-release.mjs';
import worker from '../workers/web/src/index.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';

const expected = async () => ({ app: await schemaDigest(MIGRATIONS.app), analytics: await schemaDigest(MIGRATIONS.analytics) });
const env = (over = {}) => ({ APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging', REACTION_GUARD_SECRET: 's', ...over });
const ctx = { waitUntil() {}, passThroughOnException() {} };
const health = async (e) => {
  const res = await worker.fetch(new Request('https://americawhat-web-staging.hakan-c89.workers.dev/api/health'), e, ctx);
  return { status: res.status, body: await res.json() };
};

test('MIGRATIONS lists exactly the migration files in the repository', () => {
  const repo = repoMigrations();
  assert.deepEqual([...MIGRATIONS.app].sort(), repo.app);
  assert.deepEqual([...MIGRATIONS.analytics].sort(), repo.analytics);
});

test('health publishes digests (not names) and is ok when every expected migration is recorded', async () => {
  const { status, body } = await health(env());
  assert.equal(status, 200);
  assert.equal(body.checks.schema_app, 'ok');
  assert.equal(body.checks.schema_analytics, 'ok');
  assert.deepEqual(body.schema, await expected());
  assert.doesNotMatch(JSON.stringify(body), /0001_|\.sql/);
});

test('a pending, an extra or an unreadable migration record makes health fail (503)', async () => {
  const pending = env();
  pending.APP_DB.sqlite.exec("DELETE FROM d1_migrations");
  let r = await health(pending);
  assert.equal(r.status, 503);
  assert.equal(r.body.checks.schema_app, 'mismatch');

  const extra = env();
  extra.ANALYTICS_DB.sqlite.exec("INSERT INTO d1_migrations (name) VALUES ('0002_from_another_branch.sql')");
  r = await health(extra);
  assert.equal(r.status, 503);
  assert.equal(r.body.checks.schema_analytics, 'mismatch');

  const missing = env();
  missing.APP_DB.sqlite.exec('DROP TABLE d1_migrations');
  r = await health(missing);
  assert.equal(r.status, 503);
  assert.equal(r.body.checks.schema_app, 'error');
  assert.equal(r.body.schema.app, null);
});

test('the pre-deploy gate passes only on equal digests and fails closed otherwise', async () => {
  const exp = await expected();
  assert.deepEqual(schemaGate({ schema: exp }, exp), { ok: true, errors: [] });
  assert.equal(schemaGate({ schema: { ...exp, app: 'f'.repeat(64) } }, exp).ok, false);
  assert.match(schemaGate({ schema: { ...exp, analytics: null } }, exp).errors.join(), /could not read d1_migrations/);
  assert.match(schemaGate({ status: 'ok' }, exp).errors.join(), /reports no schema digests/);
  assert.equal(schemaGate(null, exp).ok, false);
  // A new migration in the repository that production has not applied yet.
  const ahead = { ...exp, app: await schemaDigest([...MIGRATIONS.app, '0002_new.sql']) };
  assert.equal(schemaGate({ schema: exp }, ahead).ok, false);
});
