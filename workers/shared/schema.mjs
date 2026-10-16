// D1 schema state without any D1 API permission.
//
// MIGRATIONS lists the migration files this release expects in each database
// (kept equal to migrations/* by tests/schema-gate.test.mjs). The Web Worker
// reads the names Wrangler recorded in each database's d1_migrations table
// through its own binding and publishes only a SHA-256 digest of them on
// /api/health. The deploy workflow compares the live digest with this
// release's digest BEFORE uploading (scripts/release/cf-release.mjs
// schema-gate), and the post-deploy smoke test requires the new version's
// health to report the schema as current. No migration is ever applied by CI.

import { sha256Hex } from './http.mjs';

export const MIGRATIONS = Object.freeze({
  app: Object.freeze(['0001_app_core.sql']),
  analytics: Object.freeze(['0001_analytics_core.sql']),
});

/** Order-independent digest of migration file names. */
export function schemaDigest(names) {
  return sha256Hex([...names].sort().join('\n'));
}

/** Names Wrangler recorded as applied; throws if the table is missing. */
export async function appliedMigrations(db) {
  const { results } = await db.prepare('SELECT name FROM d1_migrations ORDER BY name').all();
  return results.map((r) => String(r.name));
}

/** { checks: {schema_app, schema_analytics}, digests: {app, analytics} } for /api/health. */
export async function schemaHealth(env) {
  const checks = {};
  const digests = {};
  for (const [key, db] of [['app', env.APP_DB], ['analytics', env.ANALYTICS_DB]]) {
    try {
      const digest = await schemaDigest(await appliedMigrations(db));
      digests[key] = digest;
      checks[`schema_${key}`] = digest === (await schemaDigest(MIGRATIONS[key])) ? 'ok' : 'mismatch';
    } catch {
      digests[key] = null;
      checks[`schema_${key}`] = 'error';
    }
  }
  return { checks, digests };
}
