#!/usr/bin/env node
// Runs the real Boss Worker locally in workerd (`wrangler dev`) with local D1,
// a locally signed Access identity and an in-memory GitHub. Nothing leaves
// this machine and no Cloudflare or GitHub resource is touched.
//
//   node scripts/dev/boss-preview.mjs           start, run smoke checks, stop
//   node scripts/dev/boss-preview.mjs --serve   keep running at http://127.0.0.1:8788
//
// The local-only seams it uses (BOSS_DEV_JWKS, BOSS_GITHUB_API_BASE) are
// honoured only when ENVIRONMENT=local and the request is on a loopback
// address; staging and production ignore them (tests/boss-auth.test.mjs).

import http from 'node:http';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { FakeGitHub } from '../../tests/helpers/fake-github.mjs';
import { AUD, TEAM, makeSigner } from '../../tests/helpers/access-jwt.mjs';
import { assignSlugs } from '../../src/lib/slug.js';
import { syntheticAnalyticsSql, syntheticAppSql, syntheticPanelLog } from './synthetic-data.mjs';

const PROXY_PORT = 8788;
const WORKER_PORT = 8789;
const GITHUB_PORT = 8790;
const ORIGIN = `http://127.0.0.1:${PROXY_PORT}`;
const CONFIG = 'workers/boss/wrangler.jsonc';
// A dedicated local state directory, emptied at every start: the preview never
// shares a database with anything else and always starts from the same data.
const STATE = '.wrangler/boss-preview-state';
const signer = makeSigner('local-preview');
const env = { ...process.env };
delete env.CLOUDFLARE_API_TOKEN;

const pending = JSON.parse(fs.readFileSync('src/data/pending.json', 'utf8')).slice(0, 25);
const gh = new FakeGitHub({
  'src/data/published.json': fs.readFileSync('src/data/published.json', 'utf8').replace(/\r\n/g, '\n'),
  'src/data/pending.json': `${JSON.stringify(pending, null, 2)}\n`,
  'src/data/fetch-status.json': fs.readFileSync('src/data/fetch-status.json', 'utf8'),
});

const githubServer = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const r = await gh.fetch(`http://127.0.0.1:${GITHUB_PORT}${req.url}`, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks).toString() : undefined });
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(await r.text());
});
await new Promise((resolve) => githubServer.listen(GITHUB_PORT, '127.0.0.1', resolve));
// Refuse to start next to a leftover worker: it would answer with another identity key.
try { await fetch(`http://127.0.0.1:${WORKER_PORT}/`); console.error(`port ${WORKER_PORT} is in use; stop the old preview first`); process.exit(1); } catch { /* free */ }

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
fs.rmSync(STATE, { recursive: true, force: true });
for (const db of ['americawhat-app-staging', 'americawhat-analytics-staging']) {
  spawnSync(npx, ['wrangler', 'd1', 'migrations', 'apply', db, '--local', '--persist-to', STATE, '--config', CONFIG], { env, stdio: 'ignore', shell: process.platform === 'win32' });
}

// Synthetic analytics (legacy corpus older than 90 days + 20 days of native
// rows) and synthetic reaction counts, written to the LOCAL databases only.
// Re-running adds nothing (deterministic identities, INSERT OR IGNORE).
const published = JSON.parse(fs.readFileSync('src/data/published.json', 'utf8')).items;
const pages = ['/', '/about/', ...assignSlugs(published).slice(0, 40).map((slug) => `/item/${slug}/`)];
const seedNow = Math.floor(Date.now() / 1000);
const analyticsSeed = await syntheticAnalyticsSql({ pages, now: seedNow });
fs.mkdirSync('.wrangler', { recursive: true });
fs.writeFileSync('.wrangler/preview-seed-analytics.sql', analyticsSeed.sql);
fs.writeFileSync('.wrangler/preview-seed-app.sql', syntheticAppSql({ ids: published.map((it) => it.id), now: seedNow }));
for (const [db, file] of [['americawhat-analytics-staging', '.wrangler/preview-seed-analytics.sql'], ['americawhat-app-staging', '.wrangler/preview-seed-app.sql']]) {
  const r = spawnSync(npx, ['wrangler', 'd1', 'execute', db, '--local', '--persist-to', STATE, '--file', file, '--config', CONFIG, '-y'], { env, stdio: 'ignore', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`seeding ${db} failed`);
}
// A longer synthetic log next to it, to try the Legacy import page (delta).
fs.writeFileSync('.wrangler/preview-legacy-log-delta.ndjson', `${analyticsSeed.log}${syntheticPanelLog({ pages, endAt: seedNow, days: 3, perDay: 4, seed: 99 })}`);

const vars = {
  ENVIRONMENT: 'local', BOSS_ORIGIN: ORIGIN, BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD,
  BOSS_DEV_JWKS: JSON.stringify({ keys: [signer.jwk] }), BOSS_CSRF_SECRET: 'local-preview-only', GITHUB_TOKEN: 'local-fake',
  BOSS_GITHUB_API_BASE: `http://127.0.0.1:${GITHUB_PORT}`, BOSS_GITHUB_BRANCH: 'content-staging',
};
// Vars go through a temporary, git-ignored .dev.vars next to the config
// (wrangler's local override file), single-quoted so JSON survives. It is
// removed when the preview stops.
const varsFile = 'workers/boss/.dev.vars';
if (fs.existsSync(varsFile)) throw new Error(`${varsFile} already exists; remove it first`);
fs.writeFileSync(varsFile, Object.entries(vars).map(([k, v]) => `${k}='${v}'`).join('\n'));
// Spawned directly (no shell) so stopping the tree also stops workerd.
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', CONFIG, '--port', String(WORKER_PORT), '--ip', '127.0.0.1', '--persist-to', STATE],
  { env, stdio: ['ignore', 'pipe', 'pipe'] });
let workerLog = '';
worker.stdout.on('data', (d) => { workerLog += d; });
worker.stderr.on('data', (d) => { workerLog += d; });

async function waitReady() {
  for (let i = 0; i < 90; i++) {
    try { await fetch(`http://127.0.0.1:${WORKER_PORT}/health`); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error(`worker did not start:\n${workerLog.slice(-2000)}`);
}
await waitReady();

const proxy = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = { ...req.headers, 'cf-access-jwt-assertion': signer.sign() };
  delete headers.host;
  const r = await fetch(`http://127.0.0.1:${WORKER_PORT}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'manual' });
  // fetch() already decoded the body; drop the encoding headers that no longer apply.
  const out = Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(k)));
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((resolve) => proxy.listen(PROXY_PORT, '127.0.0.1', resolve));

function stop(code) {
  proxy.close();
  githubServer.close();
  worker.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(worker.pid), '/T', '/F'], { stdio: 'ignore' });
  fs.rmSync(varsFile, { force: true });
  process.exit(code);
}

if (process.argv.includes('--serve')) {
  console.log(`Boss preview: ${ORIGIN} (local only; Ctrl+C to stop)`);
  console.log('Synthetic log to try Analytics → Legacy log import: .wrangler/preview-legacy-log-delta.ndjson');
  console.log('Votes snapshot to try Reactions → Import: tests/fixtures/votes/aw_votes-sample.json');
  process.on('SIGINT', () => stop(0));
} else {
  const results = [];
  const check = async (name, fn) => {
    try { results.push([name, (await fn()) ? 'PASS' : 'FAIL']); } catch (e) { results.push([name, `FAIL ${e.message}`]); }
  };
  const csrfFrom = (html) => /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  await check('direct request without identity -> 401', async () => (await fetch(`http://127.0.0.1:${WORKER_PORT}/review`)).status === 401);
  await check('forged identity -> 401', async () => (await fetch(`http://127.0.0.1:${WORKER_PORT}/review`, { headers: { 'Cf-Access-Jwt-Assertion': makeSigner('local-preview').sign() } })).status === 401);
  let reviewHtml = '';
  await check('review renders from GitHub content', async () => { const r = await fetch(`${ORIGIN}/review`); reviewHtml = await r.text(); return r.status === 200 && reviewHtml.includes('distinct stories'); });
  for (const p of ['/published', '/analytics', '/reactions', '/audit', '/health']) await check(`${p} renders`, async () => (await fetch(`${ORIGIN}${p}`)).status === 200);
  await check('POST with a foreign Origin refused', async () => (await fetch(`${ORIGIN}/review/apply`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: `csrf=${csrfFrom(reviewHtml)}&count=0` })).status === 403);
  await check('reject one candidate = one commit on the content branch', async () => {
    const before = gh.commitCount();
    const id = /name="e0_id" value="([^"]+)"/.exec(reviewHtml)[1];
    const body = new URLSearchParams({ csrf: csrfFrom(reviewHtml), count: '1', e0_id: id, e0_action: 'reject', e0_reason: 'ROUTINE' });
    const r = await fetch(`${ORIGIN}/review/apply`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
    const pendingAfter = JSON.parse(gh.headFiles()['src/data/pending.json']);
    return r.status === 303 && gh.commitCount() === before + 1 && !pendingAfter.some((p) => p.id === id);
  });
  await check('legacy import in workerd: inventory, apply, idempotent', async () => {
    const log = fs.readFileSync('tests/fixtures/legacy/panel-log-s1.ndjson', 'utf8');
    const page = await (await fetch(`${ORIGIN}/analytics/import`)).text();
    const form = () => { const f = new FormData(); f.set('csrf', csrfFrom(page)); f.set('file', new Blob([log]), 'aw_panel_log.txt'); return f; };
    const inv = await (await fetch(`${ORIGIN}/analytics/import`, { method: 'POST', body: form(), headers: { Origin: ORIGIN } })).text();
    const sha = /<code>([0-9a-f]{64})<\/code>/.exec(inv)?.[1];
    if (!sha) return false;
    const legacyCount = async () => Number(/<b>(\d+)<\/b>page views in view/.exec(await (await fetch(`${ORIGIN}/analytics?origin=legacy`)).text())[1]);
    const before = await legacyCount();
    const counts = [];
    for (let i = 0; i < 2; i++) {
      const f = form();
      f.set('confirm', sha.slice(0, 12));
      const r = await fetch(`${ORIGIN}/analytics/import`, { method: 'POST', body: f, headers: { Origin: ORIGIN }, redirect: 'manual' });
      if (r.status !== 303) return false;
      counts.push(await legacyCount());
    }
    return counts[0] === before + 5 && counts[1] === counts[0];
  });
  await check('analytics: synthetic history, retention overdue warning, legacy and native rows', async () => {
    const html = await (await fetch(`${ORIGIN}/analytics`)).text();
    return html.includes('older than the 90-day target') && html.includes('>legacy<') && html.includes('>native<');
  });
  await check('export: CSV of the current view', async () => {
    const r = await fetch(`${ORIGIN}/analytics/export?format=csv&range=7d`);
    const text = await r.text();
    return r.status === 200 && (r.headers.get('content-type') || '').startsWith('text/csv') && text.startsWith('"all_no"');
  });
  await check('Delete Before Date: exact preview, typed date, records removed, aggregates kept', async () => {
    const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const preview = await (await fetch(`${ORIGIN}/analytics/retention?before=${cutoff}`)).text();
    const expected = /name="expected" value="(\d+)"/.exec(preview)?.[1];
    const op = /name="op" value="([^"]+)"/.exec(preview)?.[1];
    if (!expected || !op) return false;
    const body = new URLSearchParams({ csrf: csrfFrom(preview), cutoff, expected, op, confirm: cutoff });
    const r = await fetch(`${ORIGIN}/analytics/retention/delete`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
    const message = new URL(r.headers.get('location'), ORIGIN).searchParams.get('m') || '';
    const after = await (await fetch(`${ORIGIN}/analytics`)).text();
    return r.status === 303 && message.startsWith(`Deleted ${expected} records`) && /kept only as aggregates/.test(after);
  });
  await check('reactions: snapshot plan, apply with SHA prefix, export', async () => {
    const page = await (await fetch(`${ORIGIN}/reactions`)).text();
    const votes = fs.readFileSync('tests/fixtures/votes/aw_votes-sample.json', 'utf8');
    const form = (confirm) => { const f = new FormData(); f.set('csrf', csrfFrom(page)); f.set('file', new Blob([votes]), 'aw_votes.json'); if (confirm) f.set('confirm', confirm); return f; };
    const planHtml = await (await fetch(`${ORIGIN}/reactions/import`, { method: 'POST', body: form(), headers: { Origin: ORIGIN } })).text();
    const sha = /<code>([0-9a-f]{64})<\/code>/.exec(planHtml)?.[1];
    const applied = await fetch(`${ORIGIN}/reactions/import`, { method: 'POST', body: form(sha.slice(0, 12)), headers: { Origin: ORIGIN }, redirect: 'manual' });
    const exported = await (await fetch(`${ORIGIN}/reactions/export.json`)).json();
    return applied.status === 303 && exported['aw-0100'] && exported['aw-0100'].dead >= 3;
  });
  await check('manual approval with an original source = one commit, story published', async () => {
    const html = await (await fetch(`${ORIGIN}/review`)).text();
    const id = /name="e0_id" value="([^"]+)"/.exec(html)[1];
    const beforePublished = JSON.parse(gh.headFiles()['src/data/published.json']).items.length;
    const before = gh.commitCount();
    const body = new URLSearchParams({
      csrf: csrfFrom(html), count: '1', e0_id: id, e0_action: 'approve', e0_title: 'Synthetic preview story', e0_category: 'bureaucracy',
      e0_comment: 'A preview story was approved in the local Boss. Nothing left this machine.', e0_source_url: 'https://www.example.com/preview-story',
      e0_source_name: 'Example', e0_date: '2026-10-14', e0_status: 'REAL', e0_city: '', e0_state: '',
    });
    const r = await fetch(`${ORIGIN}/review/apply`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
    const after = JSON.parse(gh.headFiles()['src/data/published.json']).items;
    return r.status === 303 && gh.commitCount() === before + 1 && after.length === beforePublished + 1 && after[0].title === 'Synthetic preview story';
  });
  await check('audit lists the actions just taken', async () => {
    const html = await (await fetch(`${ORIGIN}/audit`)).text();
    return ['review_apply', 'legacy_import', 'analytics_delete_before', 'reactions_import'].every((a) => html.includes(a));
  });
  await check('every page shows the LOCAL PREVIEW banner', async () => (await (await fetch(`${ORIGIN}/health`)).text()).includes('LOCAL PREVIEW'));
  for (const [name, outcome] of results) console.log(`${outcome.padEnd(6)} ${name}`);
  stop(results.every(([, o]) => o === 'PASS') ? 0 : 1);
}
