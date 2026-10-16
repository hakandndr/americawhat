#!/usr/bin/env node
// Read-only pre-merge check: can the release branch be merged into main
// without losing editorial content? Uses only local refs (run `git fetch origin`
// first); writes nothing to the repository, the index or any branch.
//
//   node scripts/release/reconcile-main.mjs [--source HEAD] [--main origin/main] [--json out.json]
//
// Blocks (exit 1) when:
//   - main changed any file other than the four content files since the merge base;
//   - git merge-tree reports a conflict;
//   - the merged tree would lose a published item, change a published item that
//     only main edited, drop a pending candidate main has, or lose a seen id;
//   - the vote seed file or the approved OG archive would change.
// Reports published items without an approved OG image (the deploy renders
// them with the pinned renderer, docs/OG-IMAGES.md).

import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const CONTENT_FILES = ['src/data/published.json', 'src/data/pending.json', 'src/data/seen_ids.json', 'src/data/fetch-status.json'];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const show = (ref, file) => {
  const r = spawnSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};
const json = (ref, file) => { const t = show(ref, file); return t == null ? null : JSON.parse(t); };
const publishedItems = (data) => (Array.isArray(data) ? data : data?.items || []);
const pendingItems = (data) => (Array.isArray(data) ? data : data?.items || []);
const seenOf = (item) => item.seen_id || item.id;

/** Pure content comparison; inputs are parsed JSON from base, main and the merged tree. */
export function compareContent({ base, main, merged }) {
  const errors = [];
  const notes = [];
  const byId = (items) => new Map(items.map((it) => [it.id, it]));
  const baseP = byId(publishedItems(base.published));
  const mainP = byId(publishedItems(main.published));
  const mergedP = byId(publishedItems(merged.published));
  for (const [id, item] of mainP) {
    if (!mergedP.has(id)) { errors.push(`published item ${id} (on main) is missing after the merge`); continue; }
    const mainEdited = JSON.stringify(baseP.get(id)) !== JSON.stringify(item);
    if (mainEdited && JSON.stringify(mergedP.get(id)) !== JSON.stringify(item)) errors.push(`published item ${id} was edited on main and the merge does not keep that edit`);
  }
  const mergedIds = [...mergedP.keys()];
  if (new Set(mergedIds).size !== mergedIds.length) errors.push('duplicate published ids after the merge');

  const mergedPending = new Set(pendingItems(merged.pending).map((it) => it.id));
  const publishedSeen = new Set(publishedItems(merged.published).map(seenOf));
  for (const it of pendingItems(main.pending)) {
    if (!mergedPending.has(it.id) && !mergedP.has(it.id) && !publishedSeen.has(seenOf(it))) errors.push(`pending candidate ${it.id} (on main) is missing after the merge`);
  }
  const mergedSeen = new Set(merged.seen || []);
  const lostSeen = (main.seen || []).filter((s) => !mergedSeen.has(s));
  if (lostSeen.length) errors.push(`${lostSeen.length} seen ids from main are missing after the merge (candidates would be fetched again)`);
  notes.push(`published ${mainP.size} on main -> ${mergedP.size} merged; pending ${pendingItems(main.pending).length} -> ${mergedPending.size}; seen ${(main.seen || []).length} -> ${mergedSeen.size}`);
  return { errors, notes };
}

export function reconcile({ source = 'HEAD', main = 'origin/main' } = {}) {
  const errors = [];
  const base = git('merge-base', source, main);
  const mainOnly = git('log', '--format=%h %an %s', `${source}..${main}`).split('\n').filter(Boolean);
  const changedOnMain = git('diff', '--name-only', base, main).split('\n').filter(Boolean);
  const unexpected = changedOnMain.filter((f) => !CONTENT_FILES.includes(f));
  for (const f of unexpected) errors.push(`main changed ${f} since the merge base: review it by hand`);
  const changedOnSource = new Set(git('diff', '--name-only', base, source).split('\n').filter(Boolean));
  const bothChanged = CONTENT_FILES.filter((f) => changedOnMain.includes(f) && changedOnSource.has(f));

  const mt = spawnSync('git', ['merge-tree', '--write-tree', '--name-only', source, main], { encoding: 'utf8' });
  const conflict = mt.status !== 0;
  const tree = mt.stdout.split('\n')[0].trim();
  if (conflict) errors.push(`merge-tree reports conflicts: ${mt.stdout.split('\n').slice(1).filter(Boolean).join(', ')}`);

  let content = { errors: [], notes: [] };
  let og = null;
  if (!conflict) {
    const read = (ref) => ({ published: json(ref, CONTENT_FILES[0]), pending: json(ref, CONTENT_FILES[1]), seen: json(ref, CONTENT_FILES[2]) });
    content = compareContent({ base: read(base), main: read(main), merged: read(tree) });
    errors.push(...content.errors);
    for (const f of ['public/analytics/aw_votes.json']) {
      if (show(tree, f) !== show(source, f)) errors.push(`${f} would change in the merge`);
    }
    const approved = json(tree, 'scripts/release/approved-og.json');
    if (approved) {
      for (const file of approved.files) {
        const bytes = execFileSync('git', ['cat-file', 'blob', `${tree}:public/og/${file.name}`], { maxBuffer: 64 * 1024 * 1024 });
        if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) errors.push(`approved OG ${file.name} would change`);
      }
      const names = new Set(approved.files.map((f) => f.name));
      const needs = publishedItems(json(tree, CONTENT_FILES[0])).map((it) => it.id).filter((id) => !names.has(`${id}.png`));
      og = { approved: approved.files.length, renderedAtDeploy: needs };
    }
  }
  return {
    source: git('rev-parse', source),
    main: git('rev-parse', main),
    base,
    mainOnlyCommits: mainOnly,
    changedOnMain,
    bothChanged,
    mergedTree: conflict ? null : tree,
    content: content.notes,
    og,
    ok: errors.length === 0,
    errors,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const result = reconcile({ source: arg('--source', 'HEAD'), main: arg('--main', 'origin/main') });
  const out = JSON.stringify(result, null, 2);
  if (arg('--json')) fs.writeFileSync(arg('--json'), out + '\n');
  console.log(out);
  process.exit(result.ok ? 0 : 1);
}
