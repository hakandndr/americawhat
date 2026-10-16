import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticPublishedItems, syntheticReviewCandidates } from '../scripts/dev/synthetic-data.mjs';
import { validateFields } from '../workers/boss/src/editorial.mjs';
import { assignSlugs } from '../src/lib/slug.js';
import { buildReview, isPreparedDraft } from '../workers/shared/editorial-signals.mjs';

test('preview catalogue supports paging, valid editing and canonical URL collisions using fictional sources', () => {
  const items = syntheticPublishedItems();
  assert.equal(items.length, 240);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  for (const item of items) {
    assert.deepEqual(validateFields(item).errors, [], item.id);
    assert.equal(new URL(item.source_url).hostname, 'example.com');
  }
  const slugs = assignSlugs(items);
  assert.equal(slugs[1], `${slugs[0]}-2`);
  assert.equal(slugs[2], 'preview-pinned-headline');
  assert.equal(new Set(slugs).size, items.length);
});

test('preview review exercises long queues, readiness, duplicates, source risks and published matches', () => {
  const pending = syntheticReviewCandidates();
  const review = buildReview(pending, syntheticPublishedItems());
  assert.equal(review.stories, 80);
  assert.equal(review.candidates, 85);
  assert.ok(review.entries.some(entry => entry.copies > 1));
  assert.ok(review.entries.some(entry => isPreparedDraft(entry.representative)));
  assert.ok(review.entries.some(entry => !isPreparedDraft(entry.representative)));
  assert.ok(review.entries.some(entry => entry.sourceUnresolved));
  assert.ok(review.flagged > 0);
  assert.ok(review.foreign > 0);
  assert.ok(review.alreadyPublished > 0);
});
