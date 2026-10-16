// Release gate for Open Graph images. Pure functions; build-rc.mjs does the I/O.
//
// Two sources only:
//   approved  — public/og/*.png, committed and frozen, listed with SHA-256 in
//               scripts/release/approved-og.json. Never regenerated.
//   generated — .og-generated/*.png from `python scripts/gen-og.py --missing`
//               with the pinned renderer, for published items that have no
//               approved image yet. Copied into dist/og/ after the Astro build.
// Every published item must be covered by exactly one of them.

import { createHash } from 'node:crypto';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Same rule as input_digest() in scripts/gen-og.py: the fields drawn on the image. */
export function ogInputDigest(item) {
  const source = item.source_name || item.sourceName || '';
  return sha256([item.id ?? '', item.title ?? '', item.category ?? '', source].map(String).join('\x1f'));
}

/**
 * @param {object} input
 * @param {object[]} input.items              published items
 * @param {object}   input.approved           parsed approved-og.json
 * @param {Map<string,string>} input.approvedFiles  file name -> sha256 of public/og/<name>
 * @param {object|null} input.generated       parsed .og-generated/manifest.json (or null)
 * @param {Map<string,string>} input.generatedFiles file name -> sha256 of .og-generated/<name>
 * @returns {{ errors: string[], warnings: string[], copy: string[], summary: object }}
 */
export function planOgRelease({ items, approved, approvedFiles, generated, generatedFiles }) {
  const errors = [];
  const warnings = [];
  const copy = [];
  const approvedByName = new Map(approved.files.map((f) => [f.name, f]));

  const expected = [...approvedByName.keys()].sort();
  const actual = [...approvedFiles.keys()].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push('public/og/ must hold exactly the approved archive (restore it from git)');
  for (const [name, entry] of approvedByName) {
    const digest = approvedFiles.get(name);
    if (digest && digest !== entry.sha256) errors.push(`Unapproved OG artifact: ${name}`);
  }
  if (!approvedByName.has('default.png')) errors.push('approved archive lacks default.png');

  const renderer = approved.renderer;
  const generatedItems = generated?.items ?? {};
  if (generated && renderer && JSON.stringify(generated.renderer) !== JSON.stringify(renderer)) {
    errors.push('.og-generated was rendered by an unpinned renderer; rerun gen-og.py --missing with scripts/og/requirements.txt');
  }

  let approvedUsed = 0;
  let fallback = 0;
  const staleApproved = [];
  for (const item of items) {
    const name = `${item.id}.png`;
    const frozen = approvedByName.get(name);
    if (frozen) {
      approvedUsed++;
      if (frozen.inputSha256 && frozen.inputSha256 !== ogInputDigest(item)) staleApproved.push(item.id);
      continue;
    }
    const entry = generatedItems[item.id];
    if (!entry) { errors.push(`No OG image for ${item.id}: run python scripts/gen-og.py --missing`); continue; }
    if (entry.inputSha256 !== ogInputDigest(item)) { errors.push(`Stale OG image for ${item.id}: rerun gen-og.py --missing`); continue; }
    if (generatedFiles.get(name) !== entry.sha256) { errors.push(`Generated OG file does not match its manifest: ${name}`); continue; }
    if (entry.status === 'fallback') { fallback++; warnings.push(`${item.id} uses the default image (render failed)`); }
    copy.push(name);
  }
  if (staleApproved.length) {
    // A Boss edit changed the text of an approved story; its frozen image keeps the old text.
    warnings.push(`Approved OG image shows older text for: ${staleApproved.join(', ')} (see docs/OG-IMAGES.md, "Edited stories")`);
  }
  return {
    errors,
    warnings,
    copy: copy.sort(),
    summary: { items: items.length, approved: approvedUsed, generated: copy.length, fallback, staleApproved: staleApproved.length },
  };
}
