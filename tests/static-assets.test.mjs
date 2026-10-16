import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileIgnore } from '../scripts/build/verify-static.mjs';

const rules = compileIgnore(fs.readFileSync(new URL('../public/.assetsignore', import.meta.url), 'utf8'));

test('.assetsignore keeps every legacy server file out of the upload', () => {
  for (const f of ['analytics/vote.php', 'analytics/get_votes.php', 'analytics/aw_votes.json', 'analytics/.htaccess',
    '.htaccess', 'studio/index.php', 'studio/config.sample.php', 'boss/config.php', 'deep/dir/x.php', '.ftp-deploy-sync-state.json']) {
    assert.equal(rules(f), true, f);
  }
});

test('.assetsignore keeps the public site', () => {
  for (const f of ['index.html', 'item/florida-man/index.html', 'og/aw-0001.png', 'rss.xml', 'sitemap-index.xml',
    '_astro/index.abc123.css', 'robots.txt', 'favicon.svg']) {
    assert.equal(rules(f), false, f);
  }
});

test('the beacon never uses GET and keeps the host-neutral URL', () => {
  const js = fs.readFileSync(new URL('../src/scripts/tracking.js', import.meta.url), 'utf8');
  assert.match(js, /log_df\.php`, \{\s*method: "POST"/);
  assert.doesNotMatch(js, /log_df\.php\?/);
  assert.match(js, /vote\.php`, \{\s*method: "POST"/);
});

test('_headers carries the security headers of the old .htaccess', () => {
  const h = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  for (const name of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: SAMEORIGIN', 'Referrer-Policy: strict-origin-when-cross-origin',
    'Permissions-Policy:', 'Strict-Transport-Security: max-age=31536000']) assert.ok(h.includes(name), name);
});
