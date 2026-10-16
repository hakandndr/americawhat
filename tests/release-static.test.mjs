import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHtml, normalizeRss } from '../scripts/release/normalize-static.mjs';

test('release artifacts ignore wall clock and build-time Random without changing scripts or metadata', () => {
  const html = (slug) => `<title>Story</title><a href="/item/${slug}/" id="nav-random">Random?</a><script>Math.random()</script><a href="/category/">Categories</a>`;
  const normalized = normalizeHtml(html('one'), 'index.html', ['one', 'two'], 'blob');
  assert.equal(normalized, normalizeHtml(html('two'), 'index.html', ['one', 'two'], 'blob'));
  assert.equal(normalizeHtml(normalized, 'index.html', ['one', 'two'], 'blob'), normalized);
  assert.equal(normalized.replace(/href="\/item\/[^\"]+"/, ''), html('one').replace(/href="\/item\/[^\"]+"/, ''));
  const rss = (date) => `<lastBuildDate>${date}</lastBuildDate><pubDate>Original</pubDate>`;
  assert.equal(normalizeRss(rss('yesterday'), 1700000000), normalizeRss(rss('today'), 1700000000));
  assert.match(normalizeRss(rss('today'), 1700000000), /<pubDate>Original<\/pubDate>/);
});

test('release normalization fails closed when expected artifact contracts change', () => {
  assert.throws(() => normalizeHtml('<a href="/" id="nav-random">Random?</a>', 'index.html', ['one'], 'blob'));
  assert.throws(() => normalizeHtml('<p>Missing</p>', 'index.html', ['one'], 'blob'));
  assert.throws(() => normalizeHtml('<a href="/item/one/" id="nav-random"></a>'.repeat(2), 'index.html', ['one'], 'blob'));
  assert.throws(() => normalizeRss('<rss/>', 1700000000));
  assert.throws(() => normalizeRss('<lastBuildDate>x</lastBuildDate>', NaN));
});
