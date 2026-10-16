import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { parse } from 'yaml';
import { assessContentRelease, liveRelease } from '../scripts/release/content-eligibility.mjs';
import { signContentCommit, verifyContentCommit } from '../workers/shared/content-proof.mjs';
import { createGitHub } from '../workers/boss/src/github.mjs';
import { FakeGitHub } from './helpers/fake-github.mjs';

const keys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
};
const key = keys();
const P = 'src/data/published.json', Q = 'src/data/pending.json';

test('Boss proofs bind the parent, full tree and editorial message; forged/replayed proofs fail', async () => {
  const parent = 'a'.repeat(40), tree = 'b'.repeat(40);
  const message = await signContentCommit(key.privateKey, parent, tree, 'content: weekly review (1 approval)');
  assert.equal(await verifyContentCommit(key.publicKey, parent, tree, message), true);
  for (const [p, t, m, k] of [
    ['c'.repeat(40), tree, message, key.publicKey],
    [parent, 'c'.repeat(40), message, key.publicKey],
    [parent, tree, message.replace('1 approval', '2 approvals'), key.publicKey],
    [parent, tree, message, keys().publicKey],
    [parent, tree, 'content: weekly review', key.publicKey],
  ]) assert.equal(await verifyContentCommit(k, p, t, m), false);
});

test('production Boss signs real atomic GitHub transactions, including a concurrency retry', async () => {
  const gh = new FakeGitHub({ [P]: '{"items":[]}', [Q]: '[]' }, { branch: 'main' });
  const env = {
    GITHUB_TOKEN: 'test', ENVIRONMENT: 'production', BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat', BOSS_GITHUB_BRANCH: 'main',
    BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net', BOSS_CONTENT_SIGNING_KEY: key.privateKey,
  };
  gh.beforeRefUpdate = () => gh.externalCommit((files) => { files[Q] = '[{"id":"new"}]'; });
  const api = createGitHub(env, { fetchImpl: gh.fetch });
  const out = await api.transact({ message: 'content: add a story', compute: () => ({ files: { [P]: '{"items":[{"id":"aw-1"}]}' } }) });
  assert.equal(out.attempts, 2);
  const commit = gh.commits.get(out.commitSha);
  assert.equal(await verifyContentCommit(key.publicKey, commit.parents[0], commit.tree, commit.message), true);
  assert.equal(gh.headFiles()[Q], '[{"id":"new"}]');
  await assert.rejects(api.transact({ message: 'content: unsafe', compute: () => ({ files: { 'workers/web/src/index.mjs': 'bad' } }) }), /only published.json and pending.json/);
});

test('real Git history: only signed Boss content over the live code baseline is automatic', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'americawhat-content-test-'));
  const git = (args, input) => execFileSync('git', args, { cwd, input, encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Hakan Dundar', GIT_AUTHOR_EMAIL: 'hakan@dndr.net', GIT_COMMITTER_NAME: 'Hakan Dundar', GIT_COMMITTER_EMAIL: 'hakan@dndr.net',
  }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const blob = (text) => git(['hash-object', '-w', '--stdin'], text);
  const update = (file, text, mode = '100644') => git(['update-index', '--add', '--cacheinfo', `${mode},${blob(text)},${file}`]);
  const commit = async (parent, changes, { signed = true, extraParent, mode = '100644', message = 'content: weekly review' } = {}) => {
    git(['read-tree', parent]);
    for (const [file, text] of Object.entries(changes)) {
      if (text === null) git(['update-index', '--force-remove', file]); else update(file, text, mode);
    }
    const tree = git(['write-tree']);
    const proof = signed ? await signContentCommit(key.privateKey, parent, tree, message) : message;
    const head = git(['commit-tree', tree, '-p', parent, ...(extraParent ? ['-p', extraParent] : [])], proof);
    git(['update-ref', 'HEAD', head]);
    return head;
  };
  try {
    git(['init', '-q']);
    for (const file of [P, Q, 'src/data/seen_ids.json', 'src/data/fetch-status.json', 'workers/web/src/index.mjs', 'migrations/app/0001.sql', '.github/workflows/ci.yml', 'package.json', 'docs/HANDOFF.md']) update(file, 'original');
    const baseline = git(['commit-tree', git(['write-tree'])], 'baseline');
    git(['update-ref', 'HEAD', baseline]);
    const assess = (head, before, overrides = {}) => assessContentRelease({
      cwd, event: 'push', ref: 'refs/heads/main', repository: 'hakandndr/americawhat', enabled: 'true', publicKey: key.publicKey, baseline, head, before, ...overrides,
    });
    const head = await commit(baseline, { [P]: 'approved', [Q]: 'remaining' });
    assert.equal((await assess(head, baseline)).eligible, true);
    for (const overrides of [{ enabled: '' }, { publicKey: '' }, { publicKey: keys().publicKey }, { baseline: 'unknown' }, { event: 'workflow_dispatch' }, { ref: 'refs/heads/feature' }, { repository: 'other/repo' }, { before: '0'.repeat(40) }]) {
      assert.equal((await assess(head, baseline, overrides)).eligible, false);
    }
    for (const file of ['workers/web/src/index.mjs', '.github/workflows/ci.yml', 'migrations/app/0001.sql', 'package.json', 'docs/HANDOFF.md', 'public/shell.js', 'src/data/unknown.json']) {
      await t.test(`even a valid Boss proof cannot include ${file}`, async () => {
        const bad = await commit(baseline, { [P]: 'approved', [file]: 'unreviewed' });
        assert.equal((await assess(bad, baseline)).eligible, false);
      });
    }
    const unsigned = await commit(baseline, { [P]: 'approved' }, { signed: false });
    assert.equal((await assess(unsigned, baseline)).eligible, false);
    const code = await commit(baseline, { 'workers/web/src/index.mjs': 'unreviewed' }, { signed: false });
    const piggyback = await commit(code, { [P]: 'approved' });
    assert.equal((await assess(piggyback, code)).eligible, false, 'head-only path checking would let unreviewed code through');
    const revertedCode = await commit(code, { 'workers/web/src/index.mjs': 'original' }, { signed: false });
    const afterRevert = await commit(revertedCode, { [P]: 'approved' });
    assert.equal((await assess(afterRevert, revertedCode)).eligible, false, 'a clean final diff does not hide unsafe intermediate commits');
    const fetch = await commit(baseline, { [Q]: 'new candidates', 'src/data/seen_ids.json': 'seen' }, { signed: false, message: 'chore(fetch): candidates' });
    const afterFetch = await commit(fetch, { [P]: 'approved' });
    assert.equal((await assess(afterFetch, fetch)).eligible, true);
    const second = await commit(afterFetch, { [P]: 'more approved' });
    assert.equal((await assess(second, afterFetch)).eligible, true, 'queued signed transactions are verified individually');
    assert.equal((await assess(second, fetch)).eligible, false, 'multi-commit push is not one Boss transaction');
    const fetchSmuggle = await commit(baseline, { [P]: 'unsigned news', [Q]: 'candidates' }, { signed: false });
    const afterSmuggle = await commit(fetchSmuggle, { [P]: 'approved' });
    assert.equal((await assess(afterSmuggle, fetchSmuggle)).eligible, false);
    for (const mode of ['100755', '120000']) {
      const badMode = await commit(baseline, { [P]: 'approved' }, { mode });
      assert.equal((await assess(badMode, baseline)).eligible, false);
    }
    const deletion = await commit(baseline, { [P]: null });
    assert.equal((await assess(deletion, baseline)).eligible, false);
    const merged = await commit(afterFetch, { [P]: 'merged' }, { extraParent: code });
    assert.equal((await assess(merged, afterFetch)).eligible, false);
  } finally {
    // Only the unique directory created above can be removed.
    assert.equal(path.dirname(cwd), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(cwd).startsWith('americawhat-content-test-'));
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('content baseline needs healthy production and a complete SHA', async () => {
  const response = (body) => async () => new Response(JSON.stringify(body));
  assert.equal(await liveRelease(response({ status: 'ok', environment: 'production', release: 'a'.repeat(40) })), 'a'.repeat(40));
  for (const data of [{ status: 'degraded' }, { status: 'ok', environment: 'staging', release: 'a'.repeat(40) }, { status: 'ok', environment: 'production', release: 'shortsha' }]) await assert.rejects(liveRelease(response(data)));
});

test('content and code deploy paths are mutually exclusive, share serialization and use separate environments', () => {
  const wf = parse(fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8'));
  const { plan, build, deploy, content_deploy: content } = wf.jobs;
  assert.equal(deploy.if, "needs.plan.outputs.content != 'true'");
  assert.equal(content.if, "needs.plan.outputs.content == 'true'");
  assert.equal(deploy.environment.name, '${{ needs.plan.outputs.target }}');
  assert.equal(content.environment.name, 'production-content');
  assert.deepEqual(content.needs, ['plan', 'build']);
  assert.equal(plan.steps[0].with['fetch-depth'], 0);
  assert.equal(content.steps[0].with['fetch-depth'], 0);
  assert.match(JSON.stringify(plan), /content-eligibility.mjs/);
  const steps = content.steps;
  const gate = steps.findIndex((s) => s.run?.includes('content-eligibility.mjs --require'));
  assert.ok(gate > 0);
  assert.ok(!content.env.CLOUDFLARE_API_TOKEN);
  assert.ok(steps.findIndex((s) => JSON.stringify(s).includes('secrets.CLOUDFLARE_API_TOKEN')) > gate);
  assert.doesNotMatch(JSON.stringify(content), /workers\/boss|wrangler d1|secret put/);
  assert.match(JSON.stringify(content), /verify-dist|schema-gate|smoke|Roll Web back/);
  assert.ok(build.steps.some((s) => s.run === 'npm test'));
  assert.ok(build.steps.some((s) => s.run?.includes('--missing')));
});
