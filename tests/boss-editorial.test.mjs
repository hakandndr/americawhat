import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeGitHub } from './helpers/fake-github.mjs';
import { createGitHub, CONTENT_PATHS } from '../workers/boss/src/github.mjs';
import { approveBatch, computeSlugs, deletePublished, editPublished, rejectBatch, serialize, validateFields } from '../workers/boss/src/editorial.mjs';

const PUBLISHED = JSON.parse(fs.readFileSync(new URL('../src/data/published.json', import.meta.url), 'utf8'));
const COMMENT = 'A Tampa man tried to pay a parking fine with a coupon for a free car wash. The city declined, but kept the coupon.';

function pendingFixture() {
  return [
    { id: 'aw-p-aaa', seen_id: 'src-aaa', title: 'Tampa man pays fine with car wash coupon', comment: '', category: 'bureaucracy', source_url: '', external_url: 'https://news.google.com/rss/articles/CBMiX', source_domain: 'wfla.com', source_name: 'WFLA', date: '2026-10-10', score: 9 },
    { id: 'aw-p-bbb', seen_id: 'src-bbb', title: 'HOA fines family for pumpkin', comment: '', category: 'hoa-housing', source_url: '', external_url: 'https://www.example-news.com/hoa-pumpkin', source_domain: 'example-news.com', source_name: 'Example News', date: '2026-10-11', score: 7 },
  ];
}

function approval(pendingId, over = {}) {
  return {
    pendingId,
    fields: { title: 'Tampa man pays fine with car wash coupon', comment: COMMENT, category: 'bureaucracy', source_url: 'https://www.wfla.com/news/coupon-fine/', source_name: 'WFLA', date: '2026-10-10', status: 'REAL', city: 'Tampa', state: 'Florida', ...over },
  };
}

function env(over = {}) {
  return { GITHUB_TOKEN: 'test-token', BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat', BOSS_GITHUB_BRANCH: 'content-staging', ENVIRONMENT: 'staging', BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net', ...over };
}

function repo(pending = pendingFixture()) {
  return new FakeGitHub({ [CONTENT_PATHS.published]: serialize(PUBLISHED), [CONTENT_PATHS.pending]: serialize(pending) });
}

const approveCompute = (approvals) => (files) => {
  const next = approveBatch({ published: JSON.parse(files[CONTENT_PATHS.published]), pending: JSON.parse(files[CONTENT_PATHS.pending]) }, approvals);
  return { files: { [CONTENT_PATHS.published]: serialize(next.published), [CONTENT_PATHS.pending]: serialize(next.pending) }, result: next.results };
};

test('validation enforces two sentences, an original source and known values', () => {
  assert.equal(validateFields(approval('x').fields).ok, true);
  assert.deepEqual(validateFields({ ...approval('x').fields, comment: 'Just one sentence.' }).errors, ['comment_not_two_sentences']);
  assert.ok(validateFields({ ...approval('x').fields, source_url: 'https://news.google.com/rss/articles/abc' }).errors.includes('source_url_not_original'));
  assert.equal(validateFields({ ...approval('x').fields, source_url: 'https://news.google.com/rss/articles/abc' }, { overrides: { aggregatorSource: true } }).ok, true);
  assert.ok(validateFields({ ...approval('x').fields, category: 'politics' }).errors.includes('bad_category'));
  assert.ok(validateFields({ ...approval('x').fields, source_url: 'javascript:alert(1)' }).errors.includes('source_url_not_original'));
});

test('one approval is ONE commit that updates published and pending together', async () => {
  const gh = repo();
  const client = createGitHub(env(), { fetchImpl: gh.fetch });
  const before = gh.commitCount();
  const out = await client.transact({ message: 'boss: approve', compute: approveCompute([approval('aw-p-aaa')]) });
  assert.equal(gh.commitCount(), before + 1);
  const files = gh.headFiles();
  const pub = JSON.parse(files[CONTENT_PATHS.published]).items;
  const pend = JSON.parse(files[CONTENT_PATHS.pending]);
  assert.equal(pub[0].id, 'aw-0136');
  assert.equal(pub[0].seen_id, 'src-aaa');
  assert.equal(pub[0].source_domain, 'wfla.com');
  assert.deepEqual(pend.map((p) => p.id), ['aw-p-bbb']);
  assert.equal(out.result[0].outcome, 'approved');
  const commit = gh.commits.get(gh.head());
  assert.deepEqual(commit.author.email, 'hakan@dndr.net');
  assert.ok(!/co-authored-by/i.test(commit.message));
});

test('a concurrent fetch commit is retried on the new head and its candidates are kept', async () => {
  const gh = repo();
  const client = createGitHub(env(), { fetchImpl: gh.fetch });
  gh.beforeRefUpdate = () => gh.externalCommit((files) => {
    const pend = JSON.parse(files[CONTENT_PATHS.pending]);
    pend.unshift({ id: 'aw-p-new', seen_id: 'src-new', title: 'Fresh candidate', category: 'crime-weird', date: '2026-10-14' });
    files[CONTENT_PATHS.pending] = serialize(pend);
  });
  const out = await client.transact({ message: 'boss: approve', compute: approveCompute([approval('aw-p-aaa')]) });
  assert.equal(out.attempts, 2);
  const pend = JSON.parse(gh.headFiles()[CONTENT_PATHS.pending]);
  assert.deepEqual(pend.map((p) => p.id), ['aw-p-new', 'aw-p-bbb']);
});

test('double approval publishes once (idempotent)', async () => {
  const gh = repo();
  const client = createGitHub(env(), { fetchImpl: gh.fetch });
  await client.transact({ message: 'a', compute: approveCompute([approval('aw-p-aaa')]) });
  const second = await client.transact({ message: 'b', compute: approveCompute([approval('aw-p-aaa')]) });
  assert.equal(second.commitSha, null, 'nothing to commit');
  assert.equal(second.result[0].outcome, 'not_in_pending');
  const pub = JSON.parse(gh.headFiles()[CONTENT_PATHS.published]).items;
  assert.equal(pub.filter((p) => p.seen_id === 'src-aaa').length, 1);
});

test('a candidate whose story is already published is removed, not republished', () => {
  const existing = { ...PUBLISHED, items: [{ ...PUBLISHED.items[0], seen_id: 'src-aaa' }, ...PUBLISHED.items.slice(1)] };
  const next = approveBatch({ published: existing, pending: pendingFixture() }, [approval('aw-p-aaa')]);
  assert.equal(next.results[0].outcome, 'already_published');
  assert.equal(next.published.items.length, PUBLISHED.items.length);
});

test('a failed ref update leaves the branch untouched', async () => {
  const gh = repo();
  const client = createGitHub(env(), { fetchImpl: gh.fetch });
  const head = gh.head();
  gh.failNext = { method: 'PATCH', pathIncludes: '/git/refs/', status: 500 };
  await assert.rejects(() => client.transact({ message: 'x', compute: approveCompute([approval('aw-p-aaa')]) }));
  assert.equal(gh.head(), head);
});

test('a staging Boss refuses to write main; missing token refuses everything', async () => {
  const gh = repo();
  await assert.rejects(() => createGitHub(env({ BOSS_GITHUB_BRANCH: 'main' }), { fetchImpl: gh.fetch }).transact({ message: 'x', compute: approveCompute([]) }), /must not write main/);
  await assert.rejects(() => createGitHub(env({ GITHUB_TOKEN: '' }), { fetchImpl: gh.fetch }).transact({ message: 'x', compute: approveCompute([]) }), /GITHUB_TOKEN missing/);
  assert.equal(gh.requests.length, 0, 'no request is sent without a valid configuration');
});

test('rejections remove only the chosen candidates and need a reason code', () => {
  const next = rejectBatch({ published: PUBLISHED, pending: pendingFixture() }, [{ pendingId: 'aw-p-bbb', reason: 'ROUTINE' }, { pendingId: 'aw-p-aaa', reason: 'nope' }]);
  assert.deepEqual(next.pending.map((p) => p.id), ['aw-p-aaa']);
  assert.equal(next.results[1].outcome, 'invalid');
});

test('existing article URLs never move: colliding title, title edit, deletion', () => {
  const before = computeSlugs(PUBLISHED.items);
  // A new story whose title-derived slug equals an existing one.
  const collidingTitle = PUBLISHED.items[5].title;
  const next = approveBatch({ published: PUBLISHED, pending: pendingFixture() }, [approval('aw-p-aaa', { title: collidingTitle })]);
  const after = computeSlugs(next.published.items);
  assert.deepEqual(after.slice(1), before, 'every existing slug is unchanged');
  assert.notEqual(after[0], before[5]);
  // Editing a title keeps the URL.
  const edited = editPublished({ published: PUBLISHED, pending: [] }, PUBLISHED.items[3].id, { ...PUBLISHED.items[3], title: 'Completely new headline', status: 'REAL' }, { sentences: true, aggregatorSource: true });
  assert.deepEqual(computeSlugs(edited.published.items), before);
  // Deleting the first of two items sharing a base keeps the second one's URL.
  const dupIndex = before.findIndex((s, i) => before.indexOf(s.replace(/-2$/, '')) !== -1 && s.endsWith('-2'));
  if (dupIndex >= 0) {
    const firstIndex = before.indexOf(before[dupIndex].replace(/-2$/, ''));
    const del = deletePublished({ published: PUBLISHED, pending: [] }, PUBLISHED.items[firstIndex].id);
    const kept = new Map(computeSlugs(del.published.items).map((s, i) => [del.published.items[i].id, s]));
    assert.equal(kept.get(PUBLISHED.items[dupIndex].id), before[dupIndex]);
  }
});

test('serialization keeps the repository formatting byte for byte', () => {
  const raw = fs.readFileSync(new URL('../src/data/published.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(serialize(JSON.parse(raw)), raw);
});

test('the shared slug function reproduces every current URL of the old algorithm', async () => {
  const { slugify, assignSlugs } = await import('../src/lib/slug.js');
  const seen = new Map();
  const legacy = PUBLISHED.items.map((item) => {
    let base = item.slug ? slugify(item.slug) : slugify(item.title);
    if (!base) base = item.id;
    let slug = base;
    const count = seen.get(base) ?? 0;
    if (count > 0) slug = `${base}-${count + 1}`;
    seen.set(base, count + 1);
    return slug;
  });
  assert.deepEqual(assignSlugs(PUBLISHED.items), legacy);
});
