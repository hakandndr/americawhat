// Structural guarantees of the GitHub workflows and the release logic behind
// them: nothing deploys from an ordinary push or pull request, production has
// every gate, and the Hostinger FTP deploy can no longer run from this tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml'; // transitive dependency of astro, already in package-lock.json
import { activeVersion, checkTargetConfig, planRelease, planRollback, readConfigs, STAGING, versionIdFrom } from '../scripts/release/cf-release.mjs';
import { applyProductionIds, validateIds } from '../scripts/release/set-production-config.mjs';

const load = (name) => {
  const text = fs.readFileSync(`.github/workflows/${name}`, 'utf8');
  return { text, wf: parse(text) };
};
const files = fs.readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'));

test('only the known workflows exist, and every one parses with explicit read-only permissions (fetch excepted)', () => {
  assert.deepEqual(files.sort(), ['ci.yml', 'deploy-cloudflare.yml', 'deploy.yml', 'fetch.yml', 'rollback-cloudflare.yml']);
  for (const f of files) {
    const { wf } = load(f);
    assert.ok(wf.jobs && Object.keys(wf.jobs).length, f);
    assert.deepEqual(wf.permissions, f === 'fetch.yml' ? { contents: 'write' } : { contents: 'read' }, f);
  }
});

test('nothing publishes to Hostinger any more', () => {
  for (const f of files) {
    const { text } = load(f);
    assert.doesNotMatch(text, /FTP-Deploy-Action|secrets\.FTP_/, f);
  }
  const { wf } = load('deploy.yml');
  assert.deepEqual(Object.keys(wf.on), ['workflow_dispatch']);
  const steps = wf.jobs.retired.steps;
  assert.equal(steps.length, 1);
  assert.match(steps[0].run, /exit 1/);
});

test('CI and fetch hold no deploy credential; only deploy jobs in an Environment read secrets', () => {
  for (const f of files) {
    const { wf } = load(f);
    for (const [name, job] of Object.entries(wf.jobs)) {
      const usesSecrets = JSON.stringify(job).includes('secrets.');
      if (usesSecrets) assert.ok(job.environment, `${f}:${name} reads secrets outside a GitHub Environment`);
    }
  }
  assert.doesNotMatch(load('ci.yml').text, /secrets\./);
  assert.doesNotMatch(load('fetch.yml').text, /secrets\./);
});

test('the scheduled news fetch is preserved and writes only the three candidate files', () => {
  const { wf, text } = load('fetch.yml');
  assert.equal(wf.on.schedule[0].cron, '0 2,14,20 * * *');
  assert.match(text, /git add src\/data\/pending\.json src\/data\/seen_ids\.json src\/data\/fetch-status\.json/);
  for (const line of text.split('\n').filter((l) => /git (add|commit)/.test(l))) assert.doesNotMatch(line, /published\.json/);
});

test('the Cloudflare deploy is gated: main only, opt-in variable, confirmation, Environment, frozen artifact', () => {
  const { wf, text } = load('deploy-cloudflare.yml');
  assert.deepEqual(Object.keys(wf.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(wf.on.push.branches, ['main']);
  for (const ignored of ['!src/data/pending.json', '!src/data/seen_ids.json', '!src/data/fetch-status.json']) assert.ok(wf.on.push.paths.includes(ignored));
  assert.equal(wf.concurrency['cancel-in-progress'], false);
  assert.equal(wf.jobs.build.if, "needs.plan.outputs.deploy == 'true'");
  assert.equal(wf.jobs.deploy.environment.name, '${{ needs.plan.outputs.target }}');
  assert.match(JSON.stringify(wf.jobs.plan), /vars\.CF_PRODUCTION_DEPLOY_ENABLED/);
  // Inputs reach shell only through env, never interpolated into a script.
  for (const job of Object.values(wf.jobs)) for (const step of job.steps) assert.doesNotMatch(step.run || '', /\$\{\{\s*(inputs|github\.event)\./);
  assert.match(text, /check-config "\$\{\{ needs\.plan\.outputs\.target \}\}"\n/);
  assert.match(text, /verify-dist reports\/rc-static-manifest\.json dist/);
  assert.match(text, /No migrations to apply/);
  assert.match(text, /versions upload \.wrangler\/release\/web\/index\.js --no-bundle/);
  assert.doesNotMatch(text, /wrangler deploy (?!--dry-run)/, 'only versions upload/deploy; routes are never changed by CI');
  assert.doesNotMatch(text, /secret (put|bulk)|d1 migrations apply|d1 execute/);
  for (const f of files) {
    for (const m of load(f).text.matchAll(/uses: ([^\s]+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${f}: ${m[1]} is not pinned to a commit`);
  }
});

test('release plans: nothing deploys by accident', () => {
  const p = (c) => planRelease(c);
  assert.equal(p({ event: 'push', ref: 'refs/heads/main' }).deploy, false);
  assert.equal(p({ event: 'push', ref: 'refs/heads/main', productionEnabled: 'false' }).deploy, false);
  assert.deepEqual(p({ event: 'push', ref: 'refs/heads/main', productionEnabled: 'true' }), { deploy: true, target: 'production', reason: 'push to main' });
  assert.equal(p({ event: 'push', ref: 'refs/heads/codex/staging-rc', productionEnabled: 'true' }).deploy, false);
  assert.equal(p({ event: 'pull_request', ref: 'refs/pull/7/merge', productionEnabled: 'true' }).deploy, false);
  assert.equal(p({ event: 'schedule', ref: 'refs/heads/main', productionEnabled: 'true' }).deploy, false);
  assert.equal(p({ event: 'workflow_dispatch', ref: 'refs/heads/x', inputTarget: 'staging', confirm: 'staging' }).target, 'staging');
  assert.equal(p({ event: 'workflow_dispatch', ref: 'refs/heads/x', inputTarget: 'staging', confirm: 'production' }).deploy, false);
  assert.equal(p({ event: 'workflow_dispatch', ref: 'refs/heads/x', inputTarget: 'production', confirm: 'production', productionEnabled: 'true' }).deploy, false);
  assert.equal(p({ event: 'workflow_dispatch', ref: 'refs/heads/main', inputTarget: 'production', confirm: 'production' }).deploy, false);
  assert.equal(p({ event: 'workflow_dispatch', ref: 'refs/heads/main', inputTarget: 'production', confirm: 'production', productionEnabled: 'true' }).deploy, true);
  assert.equal(p({ event: 'workflow_dispatch', ref: 'refs/heads/main', inputTarget: 'hostinger', confirm: 'hostinger' }).deploy, false);
});

test('rollback plans need a UUID, a typed target/worker and main for production', () => {
  const id = '855652dd-d155-42db-a719-9c363256ab42';
  assert.equal(planRollback({ ref: 'refs/heads/main', inputTarget: 'production', worker: 'web', versionId: id, confirm: 'production/web' }).workerName, 'americawhat-web-production');
  assert.equal(planRollback({ ref: 'refs/heads/x', inputTarget: 'production', worker: 'web', versionId: id, confirm: 'production/web' }).rollback, false);
  assert.equal(planRollback({ ref: 'refs/heads/main', inputTarget: 'production', worker: 'web', versionId: 'latest', confirm: 'production/web' }).rollback, false);
  assert.equal(planRollback({ ref: 'refs/heads/main', inputTarget: 'production', worker: 'boss', versionId: id, confirm: 'production' }).rollback, false);
  assert.equal(planRollback({ ref: 'refs/heads/x', inputTarget: 'staging', worker: 'boss', versionId: id, confirm: 'staging/boss' }).workerName, 'americawhat-boss-staging');
});

test('the committed configs: staging valid, production complete except the values provisioning will supply', () => {
  const configs = readConfigs();
  assert.deepEqual(checkTargetConfig('staging', configs), { errors: [], notProvisioned: [] });
  const prod = checkTargetConfig('production', configs);
  assert.deepEqual(prod.errors, []);
  assert.deepEqual(prod.notProvisioned, ['web.APP_DB', 'web.ANALYTICS_DB', 'boss.APP_DB', 'boss.ANALYTICS_DB', 'boss.BOSS_ACCESS_AUD']);
});

test('production refuses staging values, and set-production-config writes only env.production', () => {
  const app = '11111111-2222-4333-8444-555555555555';
  const analytics = '66666666-7777-4888-8999-000000000000';
  const aud = 'a'.repeat(64);
  assert.match(validateIds({ appDb: STAGING.appDb, analyticsDb: analytics }).join(), /STAGING database/);
  assert.match(validateIds({ appDb: app, analyticsDb: app }).join(), /must differ/);
  assert.match(validateIds({ appDb: app, analyticsDb: analytics, accessAud: STAGING.accessAud }).join(), /STAGING Access/);
  assert.deepEqual(validateIds({ appDb: app, analyticsDb: analytics, accessAud: aud }), []);

  const web = applyProductionIds(fs.readFileSync('workers/web/wrangler.jsonc', 'utf8'), { appDb: app, analyticsDb: analytics });
  const boss = applyProductionIds(fs.readFileSync('workers/boss/wrangler.jsonc', 'utf8'), { appDb: app, analyticsDb: analytics, accessAud: aud });
  const parse = (t) => JSON.parse(t.replace(/^\s*\/\/.*$/gm, ''));
  const configs = { web: parse(web), boss: parse(boss) };
  assert.deepEqual(checkTargetConfig('production', configs), { errors: [], notProvisioned: [] });
  assert.deepEqual(checkTargetConfig('staging', configs), { errors: [], notProvisioned: [] }, 'staging untouched');
  assert.equal(configs.boss.vars.BOSS_ACCESS_AUD, STAGING.accessAud);

  const leaked = structuredClone(configs);
  leaked.web.env.production.d1_databases[0].database_id = STAGING.appDb;
  assert.match(checkTargetConfig('production', leaked).errors.join(), /STAGING database/);
  const wrongRepo = structuredClone(configs);
  wrongRepo.boss.env.production.vars.BOSS_GITHUB_REPOSITORY = STAGING.contentRepo;
  assert.match(checkTargetConfig('production', wrongRepo).errors.join(), /hakandndr\/americawhat on main/);
  const noLimit = structuredClone(configs);
  delete noLimit.web.env.production.limits;
  assert.match(checkTargetConfig('production', noLimit).errors.join(), /limits\.cpu_ms/);
});

test('wrangler output parsing picks exactly the uploaded version and refuses split traffic', () => {
  const id = '1346af78-327b-434d-8cd1-294d0bf39dc3';
  const out = [
    JSON.stringify({ type: 'wrangler-session', version: 1 }),
    JSON.stringify({ type: 'version-upload', version: 1, worker_name: 'americawhat-web-production', version_id: id }),
  ].join('\n');
  assert.equal(versionIdFrom(out, 'americawhat-web-production'), id);
  assert.throws(() => versionIdFrom(out, 'americawhat-boss-production'));
  assert.equal(activeVersion({ versions: [{ version_id: id, percentage: 100 }] }), id);
  assert.throws(() => activeVersion({ versions: [{ version_id: id, percentage: 50 }, { version_id: id, percentage: 50 }] }));
});

test('a production Boss writes only hakandndr/americawhat main', async () => {
  const { githubConfig } = await import('../workers/boss/src/github.mjs');
  const base = { GITHUB_TOKEN: 't', ENVIRONMENT: 'production', BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net' };
  assert.equal(githubConfig({ ...base, BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat', BOSS_GITHUB_BRANCH: 'main' }).ok, true);
  assert.equal(githubConfig({ ...base, BOSS_GITHUB_REPOSITORY: STAGING.contentRepo, BOSS_GITHUB_BRANCH: 'main' }).ok, false);
  assert.equal(githubConfig({ ...base, BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat', BOSS_GITHUB_BRANCH: 'content-staging' }).ok, false);
});
