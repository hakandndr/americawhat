// Build-output checks. Optional --baseline <dist> compares all existing pages;
// --staging <html> compares every rendered card with the approved deployment.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import data from '../../src/data/published.json' with { type: 'json' };
import { assignSlugs } from '../../src/lib/slug.js';
import { CATEGORIES } from '../../src/data/categories.js';

const root = path.resolve('dist');
const documentAt = (file) => parseHTML(fs.readFileSync(file, 'utf8')).document;
const page = (href) => documentAt(path.join(root, href, 'index.html'));
const ids = (doc) => [...doc.querySelectorAll('.feed > .card')].map((c) => c.dataset.id);
const arg = (name) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const baseline = arg('--baseline');
const staging = arg('--staging');
const items = data.items;
const sorted = [...items].sort((a, b) => a.date < b.date ? 1 : -1);
const slugs = assignSlugs(items);
const home = page('/');
const referenceCards = staging ? new Map([...documentAt(staging).querySelectorAll('.card[data-id]')].map((c) => [c.dataset.id, c.outerHTML])) : null;
const walked = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walked(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const pages = walked(root).filter((p) => p.endsWith('.html'));

assert.equal(ids(home).length, Math.min(12, items.length));
const feedIds = [];
for (let n = 1; n <= Math.ceil(items.length / 12); n++) {
  const doc = n === 1 ? home : page(`/feed/${n}/`);
  const cards = [...doc.querySelectorAll('.feed > .card')];
  assert.equal(cards.length, Math.min(12, items.length - (n - 1) * 12));
  feedIds.push(...ids(doc));
  const more = doc.querySelector('.load-more');
  assert.equal(more?.getAttribute('href') || null, n < Math.ceil(items.length / 12) ? `/feed/${n + 1}/` : null);
  if (n > 1) assert.equal(doc.querySelector('meta[name="robots"]').content, 'noindex, follow');
  for (const card of cards) {
    const item = items.find((it) => it.id === card.dataset.id);
    assert.equal(card.querySelector('.card-comment').textContent, item.comment);
    assert.equal(card.querySelector('.source a')?.getAttribute('href') || '', item.sourceUrl ?? item.source_url ?? '');
    assert.deepEqual([...card.querySelectorAll('.react-btn')].map((b) => b.dataset.reaction), ['wat', 'lol', 'same', 'dead']);
    if (referenceCards) assert.equal(card.outerHTML, referenceCards.get(item.id), `Staging card changed: ${item.id}`);
  }
}
assert.deepEqual(feedIds, sorted.map((it) => it.id));
assert.equal(new Set(feedIds).size, items.length);

const archive = [];
for (let n = 1; n <= Math.ceil(items.length / 30); n++) archive.push(...ids(page(n === 1 ? '/archive/' : `/archive/${n}/`)));
assert.deepEqual(archive, feedIds);
for (const cat of Object.keys(CATEGORIES)) {
  const expected = sorted.filter((it) => it.category === cat).map((it) => it.id);
  const actual = [];
  for (let n = 1; n <= Math.max(1, Math.ceil(expected.length / 12)); n++) {
    const doc = page(`/category/${cat}/${n > 1 ? `${n}/` : ''}`);
    actual.push(...ids(doc));
    assert.equal(doc.querySelector('.cat-chip.active').getAttribute('href'), `/category/${cat}/`);
  }
  assert.deepEqual(actual, expected, cat);
}
assert.equal(page('/category/').querySelectorAll('.category-directory li').length, Object.keys(CATEGORIES).length);

const metadata = (doc) => [
  doc.title, doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
  ...[...doc.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]')].map((n) => n.outerHTML),
  ...[...doc.querySelectorAll('script[type="application/ld+json"]')].map((n) => n.textContent),
];
const sitemap = fs.readFileSync(path.join(root, 'sitemap-0.xml'), 'utf8');
assert.ok(!sitemap.includes('/feed/'));
assert.ok(!sitemap.includes('/rss.xml'));
for (const [i, slug] of slugs.entries()) {
  const href = `/item/${slug}/`;
  const doc = page(href);
  assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'), `https://americawhat.com${href}`);
  assert.ok(sitemap.includes(`https://americawhat.com${href}`));
  assert.equal(doc.querySelector('.detail-comment').textContent, items[i].comment);
  const image = doc.querySelector('meta[property="og:image"]').content;
  assert.ok(fs.existsSync(path.join(root, new URL(image).pathname)), image);
}
let links = 0;
for (const file of pages) {
  const doc = documentAt(file);
  assert.equal(doc.querySelectorAll('h1').length, 1, file);
  assert.deepEqual([...doc.querySelectorAll('.site-nav a')].map((a) => a.textContent), ['Random?', 'Categories', 'Archive']);
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = new URL(href, 'https://americawhat.com').pathname;
    const target = path.join(root, pathname);
    assert.ok(fs.existsSync(target) || fs.existsSync(path.join(target, 'index.html')), `${file}: ${href}`);
    links++;
  }
  const canonical = doc.querySelector('link[rel="canonical"]').getAttribute('href');
  assert.equal(doc.querySelector('meta[property="og:url"]').content, canonical);
  if (baseline) {
    const oldFile = path.join(baseline, path.relative(root, file));
    if (fs.existsSync(oldFile)) assert.deepEqual(metadata(doc), metadata(documentAt(oldFile)), `Metadata drift: ${file}`);
  }
}
if (baseline) {
  const rss = (dir) => fs.readFileSync(path.join(dir, 'rss.xml'), 'utf8').replace(/<lastBuildDate>.*?<\/lastBuildDate>/, '<lastBuildDate/>');
  assert.equal(rss(root), rss(baseline));
  const oldHome = documentAt(path.join(baseline, 'index.html'));
  assert.equal(home.querySelector('.hero').outerHTML, oldHome.querySelector('.hero').outerHTML);
  assert.equal(home.querySelector('.subscribe').outerHTML, oldHome.querySelector('.subscribe').outerHTML);
  const oldURLs = [...fs.readFileSync(path.join(baseline, 'sitemap-0.xml'), 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  for (const url of oldURLs) assert.ok(sitemap.includes(`<loc>${url}</loc>`), url);
}
// Exercise the actual rendered random script; without JS its href is also checked above.
const randomScript = [...home.querySelectorAll('script')].find((s) => s.textContent.includes('nav-random'));
let randomClick;
const randomWindow = { location: {} };
vm.runInNewContext(randomScript.textContent, {
  document: { getElementById: () => ({ addEventListener: (_, cb) => { randomClick = cb; } }) },
  window: randomWindow, Math,
});
randomClick({ preventDefault() {} });
assert.ok(slugs.some((slug) => randomWindow.location.href === `/item/${slug}/`));
console.log(JSON.stringify({ pages: pages.length, stories: items.length, feedChunks: Math.ceil(items.length / 12), internalLinks: links, stagingCardsIdentical: !!staging, baselineMetadataIdentical: !!baseline, result: 'PASS' }, null, 2));
