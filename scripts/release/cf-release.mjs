#!/usr/bin/env node
// Release logic for .github/workflows/deploy-cloudflare.yml and
// rollback-cloudflare.yml, kept here so it can be tested and run locally.
// It never contacts Cloudflare: wrangler does that in the workflow.
//
//   node scripts/release/cf-release.mjs plan
//       Reads GITHUB_EVENT_NAME, GITHUB_REF, INPUT_TARGET, INPUT_CONFIRM and
//       PRODUCTION_ENABLED; writes deploy/target/... to $GITHUB_OUTPUT.
//   node scripts/release/cf-release.mjs check-config <staging|production> [--allow-unprovisioned]
//       Validates both Wrangler configs for the target. Production fails while
//       any value is still a placeholder or a staging value.
//   node scripts/release/cf-release.mjs version-id <wrangler output file> <worker name>
//   node scripts/release/cf-release.mjs active-version <deployments status json file>
//   node scripts/release/cf-release.mjs verify-dist <rc manifest> <dist dir>
//   node scripts/release/cf-release.mjs no-routes <web|boss>
//       Provisioning only: env.production without custom domains, for first creation.
//   node scripts/release/cf-release.mjs simulate
//       Prints the plan for every trigger combination (no I/O beyond reading configs).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const OWNER = 'hakan@dndr.net';
export const ACCESS_TEAM_DOMAIN = 'dndrnet.cloudflareaccess.com';

// Values that belong to staging and must never appear in a production config.
export const STAGING = Object.freeze({
  appDb: 'a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2',
  analyticsDb: '306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c',
  accessAud: 'f750490dc8657f942cf2eb7af70137e0f00bd19c9b437e7d82b0f0f2fd8b194b',
  contentRepo: 'hakandndr/americawhat-staging-content',
  contentBranch: 'content-staging',
});

export const TARGETS = Object.freeze({
  staging: {
    envArgs: [],
    web: 'americawhat-web-staging',
    boss: 'americawhat-boss-staging',
    webUrl: 'https://americawhat-web-staging.hakan-c89.workers.dev',
    bossUrl: 'https://americawhat-boss-staging.hakan-c89.workers.dev',
  },
  production: {
    envArgs: ['--env', 'production'],
    web: 'americawhat-web-production',
    boss: 'americawhat-boss-production',
    webUrl: 'https://americawhat.com',
    bossUrl: 'https://boss.americawhat.com',
  },
});

const PLACEHOLDER = 'PRODUCTION_NOT_PROVISIONED';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Wrangler JSONC as used in this repository: whole-line // comments only. */
export function parseJsonc(text) {
  return JSON.parse(String(text).replace(/^\s*\/\/.*$/gm, ''));
}

export function readConfigs(root = '.') {
  const read = (name) => parseJsonc(fs.readFileSync(path.join(root, 'workers', name, 'wrangler.jsonc'), 'utf8'));
  return { web: read('web'), boss: read('boss') };
}

/**
 * Decides whether a workflow run may deploy, and where.
 * Production needs ALL of: the main branch, the repository variable
 * CF_PRODUCTION_DEPLOY_ENABLED=true and (for a manual run) the typed
 * confirmation. The GitHub Environment's required reviewer is a further gate
 * that this function cannot see.
 */
export function planRelease({ event, ref, inputTarget = '', confirm = '', productionEnabled = '' }) {
  const enabled = String(productionEnabled).trim() === 'true';
  const no = (reason, target = '') => ({ deploy: false, target, reason });
  if (event === 'push') {
    if (ref !== 'refs/heads/main') return no(`push to ${ref} never deploys`);
    if (!enabled) return no('production deploys are disabled (repository variable CF_PRODUCTION_DEPLOY_ENABLED is not "true")', 'production');
    return { deploy: true, target: 'production', reason: 'push to main' };
  }
  if (event === 'workflow_dispatch') {
    const target = String(inputTarget);
    if (!(target in TARGETS)) return no(`unknown target "${target}"`);
    if (String(confirm).trim() !== target) return no(`confirmation "${confirm}" does not match target "${target}"`, target);
    if (target === 'production') {
      if (ref !== 'refs/heads/main') return no('production deploys run only from main', target);
      if (!enabled) return no('production deploys are disabled (repository variable CF_PRODUCTION_DEPLOY_ENABLED is not "true")', target);
    }
    return { deploy: true, target, reason: `manual ${target} deploy from ${ref}` };
  }
  return no(`event ${event} never deploys`);
}

/** A manual rollback: one Worker back to one recorded version. */
export function planRollback({ ref, inputTarget = '', worker = '', versionId = '', confirm = '' }) {
  const no = (reason) => ({ rollback: false, reason });
  const target = String(inputTarget);
  if (!(target in TARGETS)) return no(`unknown target "${target}"`);
  if (!['web', 'boss'].includes(worker)) return no(`unknown worker "${worker}"`);
  if (!UUID.test(String(versionId))) return no('version_id must be a Worker version UUID');
  if (String(confirm).trim() !== `${target}/${worker}`) return no(`confirmation must be "${target}/${worker}"`);
  if (target === 'production' && ref !== 'refs/heads/main') return no('production rollbacks run only from main');
  return { rollback: true, target, worker, versionId: String(versionId), workerName: TARGETS[target][worker], reason: `roll ${TARGETS[target][worker]} back to ${versionId}` };
}

/** Validates the configs for a target. `notProvisioned` lists placeholder values (production only). */
export function checkTargetConfig(target, { web, boss }) {
  const errors = [];
  const notProvisioned = [];
  const expect = (cond, message) => { if (!cond) errors.push(message); };
  if (target === 'staging') {
    expect(web.name === TARGETS.staging.web, 'web staging name');
    expect(boss.name === TARGETS.staging.boss, 'boss staging name');
    for (const [label, cfg] of [['web', web], ['boss', boss]]) {
      expect(cfg.vars?.ENVIRONMENT === 'staging', `${label} ENVIRONMENT must be staging`);
      expect(JSON.stringify(cfg.d1_databases.map((d) => d.database_id)) === JSON.stringify([STAGING.appDb, STAGING.analyticsDb]), `${label} must bind the staging D1 databases`);
      expect(!cfg.routes, `${label} staging must not have routes`);
    }
    expect(boss.vars.BOSS_GITHUB_REPOSITORY === STAGING.contentRepo && boss.vars.BOSS_GITHUB_BRANCH === STAGING.contentBranch, 'staging Boss must target the staging content repository');
    return { errors, notProvisioned };
  }
  if (target !== 'production') return { errors: [`unknown target ${target}`], notProvisioned };

  const pw = web.env?.production;
  const pb = boss.env?.production;
  if (!pw || !pb) return { errors: ['env.production missing'], notProvisioned };
  expect(pw.name === TARGETS.production.web, 'web production name');
  expect(pb.name === TARGETS.production.boss, 'boss production name');
  const routes = (cfg) => JSON.stringify((cfg.routes || []).map((r) => [r.pattern, r.custom_domain === true]));
  expect(routes(pw) === JSON.stringify([['americawhat.com', true], ['www.americawhat.com', true]]), 'web production routes must be the americawhat.com and www custom domains');
  expect(routes(pb) === JSON.stringify([['boss.americawhat.com', true]]), 'boss production route must be the boss.americawhat.com custom domain');
  for (const [label, cfg] of [['web', pw], ['boss', pb]]) {
    expect(cfg.workers_dev === false && cfg.preview_urls === false, `${label} production must disable workers.dev and preview URLs`);
    expect(cfg.vars?.ENVIRONMENT === 'production', `${label} ENVIRONMENT must be production`);
    expect(!('COLLECT_VISITS' in (cfg.vars || {})), `${label} production must not override COLLECT_VISITS`);
    expect(Number.isInteger(cfg.limits?.cpu_ms) && cfg.limits.cpu_ms > 0, `${label} production needs an explicit limits.cpu_ms`);
    const names = cfg.d1_databases.map((d) => d.database_name);
    expect(JSON.stringify(names) === JSON.stringify(['americawhat-app-production', 'americawhat-analytics-production']), `${label} production D1 names`);
    for (const db of cfg.d1_databases) {
      if (db.database_id === PLACEHOLDER) notProvisioned.push(`${label}.${db.binding}`);
      else expect(UUID.test(db.database_id), `${label}.${db.binding} is not a D1 UUID`);
      expect(![STAGING.appDb, STAGING.analyticsDb].includes(db.database_id), `${label}.${db.binding} uses a STAGING database`);
    }
  }
  const ids = (cfg) => JSON.stringify(cfg.d1_databases.map((d) => d.database_id));
  expect(ids(pw) === ids(pb), 'web and boss production must bind the same D1 databases');
  expect(new Set(pw.d1_databases.map((d) => d.database_id)).size === 2 || notProvisioned.length > 0, 'app and analytics must be different databases');
  expect(pw.vars.SITE_HOSTNAME === 'americawhat.com', 'web SITE_HOSTNAME');
  expect(pw.vars.PUBLIC_ORIGINS === 'https://americawhat.com,https://www.americawhat.com', 'web PUBLIC_ORIGINS');
  const v = pb.vars;
  expect(v.BOSS_ORIGIN === 'https://boss.americawhat.com', 'boss BOSS_ORIGIN');
  expect(v.BOSS_ALLOWED_EMAILS === OWNER, 'boss BOSS_ALLOWED_EMAILS must be the owner only');
  expect(v.BOSS_ACCESS_TEAM_DOMAIN === ACCESS_TEAM_DOMAIN, 'boss Access team domain');
  if (!v.BOSS_ACCESS_AUD) notProvisioned.push('boss.BOSS_ACCESS_AUD');
  else expect(/^[0-9a-f]{64}$/.test(v.BOSS_ACCESS_AUD), 'boss BOSS_ACCESS_AUD is not an Access AUD tag');
  expect(v.BOSS_ACCESS_AUD !== STAGING.accessAud, 'boss BOSS_ACCESS_AUD is the STAGING application');
  expect(v.BOSS_GITHUB_REPOSITORY === 'hakandndr/americawhat' && v.BOSS_GITHUB_BRANCH === 'main', 'production Boss must target hakandndr/americawhat on main');
  expect(v.BOSS_COMMIT_AUTHOR_NAME === 'Hakan Dundar' && v.BOSS_COMMIT_AUTHOR_EMAIL === OWNER, 'boss commit author');
  return { errors, notProvisioned };
}

/** The version id of `workerName` from a WRANGLER_OUTPUT_FILE_PATH ND-JSON file. */
export function versionIdFrom(text, workerName) {
  const entries = String(text).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const hits = entries.filter((e) => e.type === 'version-upload' && e.worker_name === workerName && UUID.test(e.version_id || ''));
  if (hits.length !== 1) throw new Error(`expected one version-upload entry for ${workerName}, found ${hits.length}`);
  return hits[0].version_id;
}

/** The single version serving 100% (refuses to roll back over a gradual rollout). */
export function activeVersion(statusJson) {
  const status = typeof statusJson === 'string' ? JSON.parse(statusJson) : statusJson;
  const versions = status?.versions || [];
  if (versions.length !== 1 || versions[0].percentage !== 100 || !UUID.test(versions[0].version_id || '')) {
    throw new Error('the Worker is not serving exactly one version at 100%; resolve the split by hand first');
  }
  return versions[0].version_id;
}

/** Re-checks a downloaded dist/ against reports/rc-static-manifest.json from the build job. */
export function verifyDist(manifest, distDir) {
  const errors = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const actual = walk(distDir).map((f) => path.relative(distDir, f).replaceAll('\\', '/')).sort();
  const expected = manifest.files.map((f) => f.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push('dist/ file list differs from the build manifest');
  for (const file of manifest.files) {
    const full = path.join(distDir, file.path);
    if (!fs.existsSync(full)) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) errors.push(`changed after build: ${file.path}`);
  }
  return errors;
}

function setOutputs(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${String(v).replace(/[\r\n]/g, ' ')}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === 'plan') {
    const plan = planRelease({
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      inputTarget: process.env.INPUT_TARGET,
      confirm: process.env.INPUT_CONFIRM,
      productionEnabled: process.env.PRODUCTION_ENABLED,
    });
    const t = TARGETS[plan.target] || {};
    setOutputs({ deploy: plan.deploy, target: plan.target, reason: plan.reason, env_args: (t.envArgs || []).join(' '), web: t.web || '', boss: t.boss || '', web_url: t.webUrl || '', boss_url: t.bossUrl || '' });
    if (!plan.deploy) console.log(`::notice::No deploy: ${plan.reason}`);
    return 0;
  }
  if (command === 'plan-rollback') {
    const plan = planRollback({ ref: process.env.GITHUB_REF, inputTarget: process.env.INPUT_TARGET, worker: process.env.INPUT_WORKER, versionId: process.env.INPUT_VERSION_ID, confirm: process.env.INPUT_CONFIRM });
    const t = TARGETS[plan.target] || {};
    setOutputs({ rollback: plan.rollback, target: plan.target || '', worker: plan.worker || '', version_id: plan.versionId || '', worker_name: plan.workerName || '', env_args: (t.envArgs || []).join(' '), reason: plan.reason });
    if (!plan.rollback) { console.error(`::error::No rollback: ${plan.reason}`); return 1; }
    return 0;
  }
  if (command === 'check-config') {
    const target = args[0];
    const { errors, notProvisioned } = checkTargetConfig(target, readConfigs());
    for (const e of errors) console.error(`config error: ${e}`);
    if (notProvisioned.length) console.error(`not provisioned: ${notProvisioned.join(', ')}`);
    const ok = errors.length === 0 && (notProvisioned.length === 0 || args.includes('--allow-unprovisioned'));
    console.log(JSON.stringify({ target, ok, errors: errors.length, notProvisioned }));
    return ok ? 0 : 1;
  }
  if (command === 'no-routes') {
    // Provisioning: the production Workers are first created WITHOUT their
    // custom domains (docs/PRODUCTION-PROVISIONING.md). Writes a git-ignored
    // config beside the real one, so relative paths still resolve.
    const worker = args[0];
    if (!['web', 'boss'].includes(worker)) { console.error('usage: no-routes web|boss'); return 2; }
    const cfg = readConfigs()[worker];
    const { errors, notProvisioned } = checkTargetConfig('production', readConfigs());
    if (errors.length || notProvisioned.length) { console.error('production config is not complete: run check-config production'); return 1; }
    delete cfg.env.production.routes;
    const out = path.join('workers', worker, 'wrangler.no-routes.jsonc');
    fs.writeFileSync(out, `// Generated by cf-release.mjs no-routes for first creation only. Do not commit.\n${JSON.stringify(cfg, null, 2)}\n`);
    console.log(out);
    return 0;
  }
  if (command === 'version-id') {
    console.log(versionIdFrom(fs.readFileSync(args[0], 'utf8'), args[1]));
    return 0;
  }
  if (command === 'active-version') {
    console.log(activeVersion(fs.readFileSync(args[0], 'utf8')));
    return 0;
  }
  if (command === 'verify-dist') {
    const errors = verifyDist(JSON.parse(fs.readFileSync(args[0], 'utf8')), args[1]);
    for (const e of errors) console.error(e);
    console.log(JSON.stringify({ ok: errors.length === 0, errors: errors.length }));
    return errors.length ? 1 : 0;
  }
  if (command === 'simulate') {
    const cases = [
      { event: 'push', ref: 'refs/heads/main' },
      { event: 'push', ref: 'refs/heads/main', productionEnabled: 'true' },
      { event: 'push', ref: 'refs/heads/codex/staging-rc', productionEnabled: 'true' },
      { event: 'pull_request', ref: 'refs/pull/1/merge', productionEnabled: 'true' },
      { event: 'workflow_dispatch', ref: 'refs/heads/codex/staging-rc', inputTarget: 'staging', confirm: 'staging' },
      { event: 'workflow_dispatch', ref: 'refs/heads/codex/staging-rc', inputTarget: 'production', confirm: 'production', productionEnabled: 'true' },
      { event: 'workflow_dispatch', ref: 'refs/heads/main', inputTarget: 'production', confirm: 'prod', productionEnabled: 'true' },
      { event: 'workflow_dispatch', ref: 'refs/heads/main', inputTarget: 'production', confirm: 'production' },
      { event: 'workflow_dispatch', ref: 'refs/heads/main', inputTarget: 'production', confirm: 'production', productionEnabled: 'true' },
    ];
    const configs = readConfigs();
    for (const c of cases) {
      const plan = planRelease(c);
      const cfg = plan.deploy ? checkTargetConfig(plan.target, configs) : null;
      const blocked = cfg && (cfg.errors.length || cfg.notProvisioned.length) ? ` -> build job FAILS: ${[...cfg.errors, ...cfg.notProvisioned.map((n) => `${n} not provisioned`)].join('; ')}` : '';
      console.log(`${c.event} ${c.ref}${c.inputTarget ? ` target=${c.inputTarget} confirm=${c.confirm}` : ''} enabled=${c.productionEnabled || 'unset'}: ${plan.deploy ? `DEPLOY ${plan.target}` : `skip (${plan.reason})`}${blocked}`);
    }
    return 0;
  }
  console.error('usage: cf-release.mjs plan|check-config|version-id|active-version|verify-dist|simulate');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exit(main(process.argv.slice(2)));
