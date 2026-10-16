#!/usr/bin/env node
// Writes the production resource identifiers into env.production of both
// Wrangler configs, after the owner has created them (docs/PRODUCTION-PROVISIONING.md).
// It only edits local files; it never creates or contacts anything.
//
//   node scripts/release/set-production-config.mjs --app-db <uuid> --analytics-db <uuid> [--access-aud <64 hex>]
//
// Refuses staging values, malformed ids and identical app/analytics ids, then
// runs the same check as the deploy workflow. Review and commit the diff.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkTargetConfig, parseJsonc, STAGING } from './cf-release.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function applyProductionIds(text, { appDb, analyticsDb, accessAud }) {
  let out = text;
  const setDb = (name, id) => {
    const re = new RegExp(`("database_name": "${name}", "database_id": ")[^"]*(")`, 'g');
    const count = (out.match(re) || []).length;
    if (count !== 1) throw new Error(`expected one ${name} binding, found ${count}`);
    out = out.replace(re, `$1${id}$2`);
  };
  if (appDb) setDb('americawhat-app-production', appDb);
  if (analyticsDb) setDb('americawhat-analytics-production', analyticsDb);
  if (accessAud !== undefined) {
    // Only the production block has an empty or 64-hex AUD after the staging one.
    const marker = out.indexOf('"production"');
    if (marker < 0) throw new Error('env.production missing');
    const head = out.slice(0, marker);
    const tail = out.slice(marker).replace(/("BOSS_ACCESS_AUD": ")[^"]*(")/, `$1${accessAud}$2`);
    out = head + tail;
  }
  return out;
}

export function validateIds({ appDb, analyticsDb, accessAud }) {
  const errors = [];
  for (const [label, id] of [['--app-db', appDb], ['--analytics-db', analyticsDb]]) {
    if (!UUID.test(id || '')) errors.push(`${label} must be a D1 database UUID`);
    if ([STAGING.appDb, STAGING.analyticsDb].includes(id)) errors.push(`${label} is a STAGING database`);
  }
  if (appDb && appDb === analyticsDb) errors.push('app and analytics databases must differ');
  if (accessAud !== undefined) {
    if (!/^[0-9a-f]{64}$/.test(accessAud)) errors.push('--access-aud must be the 64-hex AUD tag');
    if (accessAud === STAGING.accessAud) errors.push('--access-aud is the STAGING Access application');
  }
  return errors;
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const ids = { appDb: arg('--app-db'), analyticsDb: arg('--analytics-db'), accessAud: arg('--access-aud') };
  const errors = validateIds(ids);
  if (errors.length) { for (const e of errors) console.error(e); return 2; }
  for (const worker of ['web', 'boss']) {
    const file = `workers/${worker}/wrangler.jsonc`;
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, applyProductionIds(text, worker === 'boss' ? ids : { ...ids, accessAud: undefined }));
  }
  const configs = { web: parseJsonc(fs.readFileSync('workers/web/wrangler.jsonc', 'utf8')), boss: parseJsonc(fs.readFileSync('workers/boss/wrangler.jsonc', 'utf8')) };
  const result = checkTargetConfig('production', configs);
  console.log(JSON.stringify(result));
  return result.errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exit(main(process.argv.slice(2)));
