import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Only release artifacts are normalized. Browser Random behavior and public source stay intact.
export function normalizeHtml(html, relativePath, slugs, contentBlob) {
  assert.ok(slugs.length, 'A release needs published stories');
  const index = createHash('sha256').update(`${contentBlob}:${relativePath}`).digest().readUInt32BE() % slugs.length;
  let anchors = 0;
  const result = html.replace(/<a\b[^>]*\bid="nav-random"[^>]*>/g, (anchor) => {
    anchors++;
    let hrefs = 0;
    const replaced = anchor.replace(/\bhref="([^"]*)"/g, (_, href) => {
      hrefs++;
      assert.ok(slugs.some((slug) => href === `/item/${slug}/`), 'Unexpected Random fallback');
      return `href="/item/${slugs[index]}/"`;
    });
    assert.equal(hrefs, 1, 'Random anchor must have one href');
    return replaced;
  });
  assert.equal(anchors, 1, `Expected one Random anchor: ${relativePath}`);
  return result;
}

export function normalizeRss(xml, epoch) {
  assert.ok(Number.isSafeInteger(epoch) && epoch > 0, 'Valid Git commit epoch required');
  let count = 0;
  const result = xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, () => {
    count++;
    return `<lastBuildDate>${new Date(epoch * 1000).toUTCString()}</lastBuildDate>`;
  });
  assert.equal(count, 1, 'Expected one RSS build date');
  return result;
}
