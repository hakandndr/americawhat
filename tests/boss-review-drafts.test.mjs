import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderReview } from '../workers/boss/src/pages/review.mjs';
import { buildReview } from '../workers/shared/editorial-signals.mjs';

// A drafted rejection preselects Reject with its reason and note; everything
// else still defaults to Skip. Only the owner's submission decides.

const cand = (id, title, extra = {}) => ({ id, seen_id: `s-${id}`, title, category: 'crime-weird', source_url: '', external_url: `https://example.com/${id}`, source_domain: 'example.com', source_name: 'Example', date: '2026-10-10', score: 3, ...extra });

test('Weekly review preselects drafted rejections and leaves other stories on Skip', () => {
  const pending = [
    cand('a', 'Wallet lost for 51 years turns up in renovation', { draft_reason: 'NOT_US', draft_note: 'Dartmouth, Nova Scotia' }),
    cand('b', 'Iguana rescued from tree after a week on the loose', { comment: 'A fact. A twist.' }),
    cand('c', 'Guinea pig wrangled', { draft_reason: 'BOGUS' }),
  ];
  const html = renderReview({ identity: { email: 'o@example.com' }, review: buildReview(pending, []), fetchStatus: null, csrf: 't' });
  const { document } = parseHTML(html);
  const card = (id) => document.querySelector(`input[type=hidden][value="${id}"]`).closest('article');
  const checked = (id) => card(id).querySelector('input[type=radio]:checked').value;
  assert.equal(checked('a'), 'reject');
  assert.equal(card('a').querySelector('select[name$="_reason"]').value, 'NOT_US');
  assert.equal(card('a').querySelector('input[name$="_note"]').getAttribute('value'), 'Dartmouth, Nova Scotia');
  assert.match(card('a').textContent, /draft: reject NOT_US/);
  assert.equal(checked('b'), 'skip');
  assert.equal(checked('c'), 'skip', 'an unknown draft reason is ignored');
});
