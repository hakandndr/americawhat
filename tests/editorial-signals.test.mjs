import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReview, clusterCandidates, countSentences, geography, isOriginalSourceUrl, publishedMatch, riskFlags, titleTokens } from '../workers/shared/editorial-signals.mjs';
import { applyCuration } from '../scripts/editorial/apply-curation.mjs';

const c = (id, title, extra = {}) => ({ id, seen_id: `s-${id}`, title, date: '2026-10-10', source_domain: 'example.com', external_url: `https://news.google.com/rss/articles/${id}`, score: 5, category: 'crime-weird', ...extra });

test('copies of one story from different outlets cluster; different stories do not', () => {
  const items = [
    c('a', 'Florida man arrested after trying to pay for tacos with a live alligator - WFLA'),
    c('b', 'Florida man tries to pay for tacos with live alligator, arrested', { source_domain: 'msn.com' }),
    c('c', 'Ohio HOA fines family for blue mailbox'),
    c('d', 'Florida man arrested after trying to pay for tacos with a live alligator', { date: '2026-09-01' }),
  ];
  const clusters = clusterCandidates(items);
  const ab = clusters.find((cl) => cl.members.some((m) => m.id === 'a'));
  assert.deepEqual(ab.members.map((m) => m.id).sort(), ['a', 'b']);
  assert.equal(clusters.length, 3, 'same headline outside the 7-day window stays separate');
});

test('the representative prefers a newsroom over an aggregator', () => {
  const review = buildReview([c('a', 'Goat elected honorary mayor of small Vermont town', { source_domain: 'msn.com' }), c('b', 'Goat elected honorary mayor of small Vermont town', { source_domain: 'wcax.com' })], []);
  assert.equal(review.entries[0].representative.id, 'b');
  assert.equal(review.entries[0].copies, 2);
});

test('published matching by seen id, source URL and headline', () => {
  const pub = [{ id: 'aw-0001', title: 'Goat elected honorary mayor of small Vermont town', seen_id: 's-x', source_url: 'https://wcax.com/goat' }];
  assert.equal(publishedMatch(c('x', 'whatever'), pub).reason, 'seen_id');
  assert.equal(publishedMatch({ title: 'q', source_url: 'https://wcax.com/goat' }, pub).reason, 'source_url');
  assert.equal(publishedMatch({ title: 'Goat elected honorary mayor of Vermont town' }, pub).reason, 'title');
  assert.equal(publishedMatch({ title: 'Ohio HOA fines family for mailbox colour' }, pub), null);
});

test('geography: foreign domain, places and spelling; US signals', () => {
  assert.equal(geography({ title: 'Man fined for parking outside his own house', source_domain: 'bbc.co.uk' }).verdict, 'foreign_likely');
  assert.equal(geography({ title: "Cardiff's striker banned and fined" , source_domain: 'example.com' }).verdict, 'foreign_likely');
  assert.equal(geography({ title: 'Florida sheriff deputies chase emu', source_domain: 'wfla.com' }).verdict, 'us_likely');
  assert.equal(geography({ title: 'Man fined', source_domain: 'example.com' }).verdict, 'unknown');
});

test('risk flags point at the hard-reject families without deciding', () => {
  const flags = riskFlags({ title: 'Florida man in G-string arrested at Target for indecent exposure' }).map((f) => f.code);
  assert.ok(flags.includes('HARD_REJECT_SEXUAL'));
  assert.deepEqual(riskFlags({ title: 'HOA fines family over pumpkin colour' }), []);
});

test('original source URL rules', () => {
  assert.equal(isOriginalSourceUrl('https://www.wfla.com/news/x/'), true);
  assert.equal(isOriginalSourceUrl('https://news.google.com/rss/articles/CBMi'), false);
  assert.equal(isOriginalSourceUrl('javascript:alert(1)'), false);
  assert.equal(isOriginalSourceUrl('notaurl'), false);
});

test('two-sentence check copes with abbreviations, initials and amounts', () => {
  assert.equal(countSentences('A St. Petersburg man paid $4.50 for it. The U.S. Marshals were not amused.'), 2);
  assert.equal(countSentences('Dr. Smith of Mt. Dora said no. Nobody asked why.'), 2);
  assert.equal(countSentences('Only one sentence here.'), 1);
  assert.equal(countSentences('One. Two. Three.'), 3);
  assert.equal(countSentences(''), 0);
});

test('titleTokens drops the publisher suffix and stopwords', () => {
  assert.deepEqual([...titleTokens('Florida man arrested after chase - Local 10')].sort(), ['arrested', 'chase', 'florida']);
});

test('curation applies to the current pending without dropping unnamed candidates', () => {
  const pending = [c('a', 'A'), c('b', 'B'), c('new', 'Added by the fetcher meanwhile')];
  const r = applyCuration(pending, { keep: [{ id: 'a', comment: 'One fact. One twist.', source_url: 'https://wfla.com/a' }], drop: ['b'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.pending.map((p) => p.id), ['a', 'new']);
  assert.equal(r.pending[0].comment, 'One fact. One twist.');
  assert.equal(r.untouched, 1);
  const bad = applyCuration(pending, { keep: [{ id: 'zzz' }, { id: 'a', comment: 'Just one.' }], drop: ['a'] });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 3);
});
