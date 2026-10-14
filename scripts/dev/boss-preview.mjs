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

const PROXY_PORT = 8788;
const WORKER_PORT = 8789;
const GITHUB_PORT = 8790;
const ORIGIN = `http://127.0.0.1:${PROXY_PORT}`;
const CONFIG = 'workers/boss/wrangler.jsonc';
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
for (const db of ['americawhat-app-staging', 'americawhat-analytics-staging']) {
  spawnSync(npx, ['wrangler', 'd1', 'migrations', 'apply', db, '--local', '--config', CONFIG], { env, stdio: 'ignore', shell: process.platform === 'win32' });
}

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
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', CONFIG, '--port', String(WORKER_PORT), '--ip', '127.0.0.1'],
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
    for (let i = 0; i < 2; i++) {
      const f = form();
      f.set('confirm', sha.slice(0, 12));
      const r = await fetch(`${ORIGIN}/analytics/import`, { method: 'POST', body: f, headers: { Origin: ORIGIN }, redirect: 'manual' });
      if (r.status !== 303) return false;
    }
    const analytics = await (await fetch(`${ORIGIN}/analytics?origin=legacy`)).text();
    return /<b>5<\/b>page views in view/.test(analytics);
  });
  for (const [name, outcome] of results) console.log(`${outcome.padEnd(6)} ${name}`);
  stop(results.every(([, o]) => o === 'PASS') ? 0 : 1);
}
