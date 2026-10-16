import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assignSlugs } from '../../src/lib/slug.js';
import { normalizeHtml, normalizeRss } from './normalize-static.mjs';
import { planOgRelease } from './og.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain'), '', 'Commit/review local changes before building an RC');
const head = git('rev-parse', 'HEAD');
const epoch = Number(git('show', '-s', '--format=%ct', head));
const contentBlob = git('rev-parse', 'HEAD:src/data/published.json');
const { items } = JSON.parse(fs.readFileSync('src/data/published.json', 'utf8'));
// Approved PNGs (public/og/) are frozen release inputs. Items published after
// the approval get an image from the pinned renderer (.og-generated/), which
// is copied into dist/og/ after the build. See docs/OG-IMAGES.md.
const approvedOgBytes = fs.readFileSync('scripts/release/approved-og.json');
const approvedOg = JSON.parse(approvedOgBytes);
const hashDir = (dir) => new Map(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => [f, createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')]) : []);
const generatedOg = fs.existsSync('.og-generated/manifest.json') ? JSON.parse(fs.readFileSync('.og-generated/manifest.json', 'utf8')) : null;
const og = planOgRelease({ items, approved: approvedOg, approvedFiles: hashDir('public/og'), generated: generatedOg, generatedFiles: hashDir('.og-generated') });
for (const warning of og.warnings) console.warn(`OG warning: ${warning}`);
assert.deepEqual(og.errors, [], og.errors.join('\n'));
assert.ok(items.every((item) => item.date && Number.isFinite(Date.parse(item.date))), 'Undated RSS items need review');
const slugs = assignSlugs(items);
execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], { stdio: 'inherit' });
for (const name of og.copy) {
  assert.ok(!fs.existsSync(path.join('dist/og', name)), `Generated OG would overwrite ${name}`);
  fs.copyFileSync(path.join('.og-generated', name), path.join('dist/og', name));
}
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const files = walk('dist').sort();
for (const file of files.filter((f) => f.endsWith('.html'))) {
  fs.writeFileSync(file, normalizeHtml(fs.readFileSync(file, 'utf8'), path.relative('dist', file).replaceAll('\\', '/'), slugs, contentBlob));
}
fs.writeFileSync('dist/rss.xml', normalizeRss(fs.readFileSync('dist/rss.xml', 'utf8'), epoch));
assert.equal(git('rev-parse', 'HEAD'), head, 'HEAD changed during build');
assert.equal(git('status', '--porcelain'), '', 'Source changed during build');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const inventory = files.map((file) => {
  const bytes = fs.readFileSync(file);
  return { path: path.relative('dist', file).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) };
});
const manifest = { head, epoch, contentBlob, node: process.version, lockSha256: sha256(fs.readFileSync('package-lock.json')), approvedOgManifestSha256: sha256(approvedOgBytes), og: { ...og.summary, generatedFiles: og.copy }, files: inventory, inventorySha256: sha256(JSON.stringify(inventory)) };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/rc-static-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ head, files: inventory.length, og: og.summary, inventorySha256: manifest.inventorySha256 }));
