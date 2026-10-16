#!/usr/bin/env node
// Verifies the built site (dist/) before any Cloudflare upload:
//  1. the upload set (dist minus .assetsignore) contains no PHP, .htaccess,
//     vote store, panel, log, configuration or secret-looking content;
//  2. every published item has its page and its OG image;
//  3. every HTML page carries a canonical link on https://americawhat.com;
//  4. the core SEO files exist.
// Exit code 1 on any failure. Prints counts only.

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.argv[2] || 'dist');
const SITE = 'https://americawhat.com';

export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** gitignore-style matching for the subset of syntax used in .assetsignore. */
export function compileIgnore(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let pattern = line.replace(/\/$/, '');
    const anchored = pattern.includes('/') && !pattern.startsWith('**/');
    pattern = pattern.replace(/^\//, '');
    const re = pattern
      .split('**').map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
      .join('.*');
    rules.push(new RegExp(anchored ? `^${re}(/.*)?$` : `(^|/)${re.replace(/^\.\*\//, '')}(/.*)?$`));
  }
  return (file) => rules.some((r) => r.test(file));
}

const FORBIDDEN = [
  [/\.php$/i, 'PHP source'],
  [/(^|\/)\.htaccess$/i, 'Apache configuration'],
  [/(^|\/)aw_votes\.json$/i, 'vote store'],
  [/(^|\/)aw_panel_log/i, 'visitor log'],
  [/(^|\/)(studio|boss)\//i, 'admin panel'],
  [/(^|\/)analytics\//i, 'legacy analytics directory'],
  [/(^|\/)config(\.[a-z]+)?\.php$/i, 'configuration'],
  [/\.(sqlite3?|db|bundle|env)$/i, 'private data file'],
];
const SECRET_MARKERS = ['github_pat_', 'ghp_', 'PANEL_PASSWORD', 'GITHUB_TOKEN', 'FTP_PASSWORD', 'BEGIN PRIVATE KEY'];

export function verify(dist = DIST) {
  const failures = [];
  const all = listFiles(dist);
  const ignoreFile = path.join(dist, '.assetsignore');
  const ignored = fs.existsSync(ignoreFile) ? compileIgnore(fs.readFileSync(ignoreFile, 'utf8')) : () => false;
  if (!fs.existsSync(ignoreFile)) failures.push('dist/.assetsignore is missing');
  const upload = all.filter((f) => !ignored(f) && !['.assetsignore', '_headers', '_redirects'].includes(f));

  for (const file of upload) {
    for (const [re, label] of FORBIDDEN) if (re.test(file)) failures.push(`would upload ${label}: ${file}`);
    if (/\.(html|js|json|xml|txt|css|svg)$/i.test(file)) {
      const body = fs.readFileSync(path.join(dist, file), 'utf8');
      for (const marker of SECRET_MARKERS) if (body.includes(marker)) failures.push(`secret marker "${marker}" in ${file}`);
    }
  }

  const published = JSON.parse(fs.readFileSync('src/data/published.json', 'utf8'));
  const items = published.items || published;
  const itemPages = upload.filter((f) => /^item\/[^/]+\/index\.html$/.test(f));
  if (itemPages.length !== items.length) failures.push(`item pages ${itemPages.length} != published items ${items.length}`);
  for (const it of items) if (!upload.includes(`og/${it.id}.png`)) failures.push(`missing OG image og/${it.id}.png`);
  for (const required of ['index.html', '404.html', 'rss.xml', 'sitemap-index.xml', 'sitemap-0.xml', 'robots.txt', 'og/default.png']) {
    if (!upload.includes(required)) failures.push(`missing ${required}`);
  }

  const html = upload.filter((f) => f.endsWith('.html'));
  let canonical = 0;
  for (const file of html) {
    const body = fs.readFileSync(path.join(dist, file), 'utf8');
    const m = /<link rel="canonical" href="([^"]+)"/.exec(body);
    if (m && m[1].startsWith(`${SITE}/`)) canonical++;
    else if (file !== '404.html') failures.push(`no canonical on ${file}`);
  }
  return { files: all.length, upload: upload.length, ignored: all.length - upload.length, html: html.length, canonical, items: items.length, failures };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('verify-static.mjs')) {
  const result = verify();
  console.log(JSON.stringify({ ...result, failures: result.failures.length }, null, 2));
  if (result.failures.length) {
    for (const f of result.failures.slice(0, 50)) console.error(`FAIL ${f}`);
    process.exit(1);
  }
}
