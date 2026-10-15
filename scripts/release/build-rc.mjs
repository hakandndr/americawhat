import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assignSlugs } from '../../src/lib/slug.js';
import { normalizeHtml, normalizeRss } from './normalize-static.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain'), '', 'Commit/review local changes before building an RC');
const head = git('rev-parse', 'HEAD');
const epoch = Number(git('show', '-s', '--format=%ct', head));
const contentBlob = git('rev-parse', 'HEAD:src/data/published.json');
// Approved PNGs are a frozen release input, not regenerated with an unverified renderer.
const approvedOgBytes = fs.readFileSync('scripts/release/approved-og.json');
const approvedOg = JSON.parse(approvedOgBytes);
assert.equal(contentBlob, approvedOg.publishedBlob, 'New published content needs an approved OG inventory');
assert.deepEqual(fs.readdirSync('public/og').sort(), approvedOg.files.map((f) => f.name).sort(), 'Restore the complete approved OG archive');
for (const file of approvedOg.files) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join('public/og', file.name))).digest('hex');
  assert.ok(actual === file.sha256, `Unapproved OG artifact: ${file.name}`);
}
const { items } = JSON.parse(fs.readFileSync('src/data/published.json', 'utf8'));
assert.ok(items.every((item) => item.date && Number.isFinite(Date.parse(item.date))), 'Undated RSS items need review');
const slugs = assignSlugs(items);
execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], { stdio: 'inherit' });
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
const manifest = { head, epoch, contentBlob, node: process.version, lockSha256: sha256(fs.readFileSync('package-lock.json')), approvedOgManifestSha256: sha256(approvedOgBytes), files: inventory, inventorySha256: sha256(JSON.stringify(inventory)) };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/rc-static-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ head, files: inventory.length, inventorySha256: manifest.inventorySha256 }));
