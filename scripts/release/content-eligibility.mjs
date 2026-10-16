#!/usr/bin/env node
// No deploy credentials. Any missing evidence selects the reviewed path.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyContentCommit } from '../../workers/shared/content-proof.mjs';

const SHA = /^[a-f0-9]{40}$/;
const PUBLISHED = 'src/data/published.json';
const CANDIDATES = ['src/data/pending.json', 'src/data/seen_ids.json', 'src/data/fetch-status.json'];
const ALLOWED = [PUBLISHED, ...CANDIDATES];

export async function assessContentRelease({ event, ref, repository, enabled, head, before, baseline, publicKey, cwd = '.' }) {
  const no = (reason) => ({ eligible: false, reason });
  if (event !== 'push' || ref !== 'refs/heads/main' || repository !== 'hakandndr/americawhat' || enabled !== 'true') return no('automatic content publishing is disabled or this is not a production push');
  if (![head, before, baseline].every((s) => SHA.test(s || '')) || !publicKey) return no('missing full commit IDs or Boss public key');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    if (git('rev-parse', 'HEAD').trim() !== head) return no('checkout does not match the event');
    git('merge-base', '--is-ancestor', baseline, head);
    const commits = git('rev-list', '--reverse', `${baseline}..${head}`).trim().split('\n').filter(Boolean);
    if (!commits.length || commits.length > 1000) return no('empty or excessive release range');
    let parent = baseline;
    for (const commit of commits) {
      const parents = git('show', '-s', '--format=%P', commit).trim();
      if (parents !== parent) return no('release range must be linear, with one parent per commit');
      if (commit === head && parents !== before) return no('push must contain exactly one Boss transaction');
      const changes = git('diff-tree', '--no-commit-id', '--name-status', '--no-renames', '-r', '-z', parent, commit).split('\0').filter(Boolean);
      const paths = [];
      for (let i = 0; i < changes.length; i += 2) {
        const [status, path] = changes.slice(i, i + 2);
        if (status !== 'M' || !ALLOWED.includes(path)) return no('non-content path, rename, addition or deletion in release range');
        for (const revision of [parent, commit]) {
          if (!git('ls-tree', revision, '--', path).startsWith('100644 blob ')) return no('content must be a regular non-executable file');
        }
        paths.push(path);
      }
      if (!paths.length) return no('empty commit in release range');
      const tree = git('show', '-s', '--format=%T', commit).trim();
      const message = git('show', '-s', '--format=%B', commit).trimEnd();
      const signed = await verifyContentCommit(publicKey, parent, tree, message);
      if (paths.includes(PUBLISHED) || commit === head) {
        if (!signed || paths.some((p) => ![PUBLISHED, CANDIDATES[0]].includes(p))) return no('published changes require a valid Boss transaction proof');
      }
      // Unsigned fetch-only commits can add candidates but never published news.
      if (commit === head && !paths.includes(PUBLISHED)) return no('no approved public content changed');
      parent = commit;
    }
    return { eligible: true, reason: 'Boss proof and every change since the live release verified' };
  } catch { return no('release history or proof could not be verified'); }
}

export async function liveRelease(fetchImpl = fetch) {
  const res = await fetchImpl('https://americawhat.com/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!res.ok || new URL(res.url || 'https://americawhat.com').origin !== 'https://americawhat.com') throw new Error('Public health unavailable');
  const health = await res.json();
  if (health.status !== 'ok' || health.environment !== 'production' || !SHA.test(health.release || '')) throw new Error('No healthy versioned production baseline');
  return health.release;
}

async function main() {
  const env = process.env;
  let result;
  try {
    const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    result = await assessContentRelease({
      event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY,
      enabled: env.CONTENT_ENABLED, head: env.GITHUB_SHA, before: event.before,
      baseline: await liveRelease(), publicKey: env.BOSS_CONTENT_PUBLIC_KEY,
    });
    if (process.argv.includes('--require')) {
      const remote = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], { encoding: 'utf8' }).split(/\s/)[0];
      if (remote !== env.GITHUB_SHA) result = { eligible: false, reason: 'a newer main commit exists; refusing a stale content deploy' };
    }
  } catch { result = { eligible: false, reason: 'content eligibility evidence unavailable' }; }
  console.log(`Content path: ${result.eligible ? 'automatic' : 'owner review'} — ${result.reason}`);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `content=${result.eligible}\n`);
  if (process.argv.includes('--require') && !result.eligible) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
