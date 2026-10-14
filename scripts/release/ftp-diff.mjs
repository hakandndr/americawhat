#!/usr/bin/env node
// Read-only pre-merge check for the Hostinger FTP deploy.
// Compares the deploy action's public sync state on the live server with the
// local dist/ (after the same exclusions as deploy.yml) and lists what an FTP
// deploy of this build would upload, replace and DELETE. Files the action never
// uploaded (log_df.php, the Studio panel, logs, private configuration) are not
// in its state and are never touched by it; this script shows them as "not
// managed by the deploy".
//
//   node scripts/release/ftp-diff.mjs [https://americawhat.com]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const base = (process.argv[2] || 'https://americawhat.com').replace(/\/$/, '');
const DIST = path.resolve('dist');

// Mirrors the exclude list of .github/workflows/deploy.yml.
const EXCLUDES = [/(^|\/)\.git[^/]*\//, /(^|\/)node_modules\//, /(^|\/)aw_votes\.json$/, /(^|\/)config\.php$/, /(^|\/)studio\//, /(^|\/)boss\//, /(^|\/)\.assetsignore$/, /(^|\/)_headers$/];
const excluded = (f) => EXCLUDES.some((re) => re.test(f));

function listFiles(dir, root = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, root) : [path.relative(root, full).split(path.sep).join('/')];
  });
}

const res = await fetch(`${base}/.ftp-deploy-sync-state.json`, { headers: { 'User-Agent': 'americawhat-ftp-diff/1.0 (read-only)' } });
if (!res.ok) { console.error(`sync state not readable (${res.status})`); process.exit(2); }
const state = await res.json();
const remote = new Map((state.data || []).filter((x) => x.type === 'file').map((x) => [x.name, x.hash]));
const local = new Map();
for (const f of listFiles(DIST)) {
  if (excluded(f)) continue;
  // The deploy runs on Linux from an LF checkout; a Windows checkout has CRLF
  // text files, so text is normalised to LF to predict the CI build's hashes.
  let bytes = fs.readFileSync(path.join(DIST, f));
  if (/\.(php|html|xml|txt|css|js|json|svg)$|(^|\/)\.htaccess$/.test(f)) bytes = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
  local.set(f, crypto.createHash('sha256').update(bytes).digest('hex'));
}

const added = [...local.keys()].filter((f) => !remote.has(f));
const deleted = [...remote.keys()].filter((f) => !local.has(f) && !excluded(f));
const changed = [...local.keys()].filter((f) => remote.has(f) && remote.get(f) !== local.get(f));
const sensitive = [...added, ...changed].filter((f) => /\.(php|htaccess)$|(^|\/)\.htaccess$|config|aw_votes|aw_panel_log|\.sql$|\.env/.test(f));

const report = {
  syncStateGenerated: state.generatedTime ? new Date(state.generatedTime).toISOString() : null,
  remoteManagedFiles: remote.size,
  localFiles: local.size,
  wouldAdd: added.length,
  wouldReplace: changed.length,
  wouldDelete: deleted,
  serverFilesTouchedThatAreSensitive: sensitive,
  phpOrHtaccessChanged: changed.filter((f) => /\.php$|\.htaccess$/.test(f)),
};
console.log(JSON.stringify(report, null, 2));
process.exit(deleted.some((f) => /analytics\/|\.php$|\.htaccess$/.test(f)) ? 1 : 0);
