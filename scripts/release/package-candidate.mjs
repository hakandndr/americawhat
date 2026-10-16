#!/usr/bin/env node
// Freezes a staging release candidate (docs/STAGING-DEPLOYMENT.md):
//   reports/<name>-candidate/{web,boss}/   wrangler dry-run bundles
//   reports/<name>-candidate/config/       copies of both Wrangler configs
//   reports/<name>-candidate/dist/         the build:rc static output
//   reports/<name>-release-manifest.json   head + SHA-256 of every file
// Prints the manifest SHA-256 ("seal") for verify-staging-candidate.mjs.
// Run after `npm run build:rc` on a clean HEAD. Uploads nothing.
//
//   node scripts/release/package-candidate.mjs <name>

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const name = process.argv[2];
assert.ok(/^[a-z0-9-]+$/.test(name || ''), 'usage: package-candidate.mjs <name>');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain'), '', 'Clean source required');
const head = git('rev-parse', 'HEAD');
const rc = JSON.parse(fs.readFileSync('reports/rc-static-manifest.json', 'utf8'));
assert.equal(rc.head, head, 'dist/ was built from another commit: run npm run build:rc');

const root = path.resolve('reports', `${name}-candidate`);
assert.ok(!fs.existsSync(root), `${root} exists; frozen candidates are never rewritten`);
fs.mkdirSync(path.join(root, 'config'), { recursive: true });
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js');
for (const worker of ['web', 'boss']) {
  execFileSync(process.execPath, [wrangler, 'deploy', '--dry-run', '--config', `workers/${worker}/wrangler.jsonc`, '--outdir', path.join(root, worker)], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CLOUDFLARE_API_TOKEN: '' } });
  for (const extra of fs.readdirSync(path.join(root, worker))) if (extra.endsWith('.map')) fs.rmSync(path.join(root, worker, extra));
  fs.copyFileSync(`workers/${worker}/wrangler.jsonc`, path.join(root, 'config', `${worker}.jsonc`));
}
fs.cpSync('dist', path.join(root, 'dist'), { recursive: true });

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(root).sort().map((file) => {
  const bytes = fs.readFileSync(file);
  return { path: path.relative(root, file).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const distOk = rc.files.every((f) => files.some((g) => g.path === `dist/${f.path}` && g.sha256 === f.sha256));
assert.ok(distOk, 'packaged dist differs from the build:rc manifest');
const manifestPath = path.resolve('reports', `${name}-release-manifest.json`);
const manifest = { head, packageRoot: path.relative(process.cwd(), root).replaceAll('\\', '/'), createdAt: new Date().toISOString(), files };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const seal = createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
console.log(JSON.stringify({ head, manifest: path.relative(process.cwd(), manifestPath).replaceAll('\\', '/'), files: files.length, seal }));
