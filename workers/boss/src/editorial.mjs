// Pure editorial state transitions on { published, pending }. No I/O: the
// GitHub transaction reads the current files, calls one of these, and commits
// the result atomically. Re-running a transition on newer files (after a
// concurrent fetch or approval) gives a correct result, which is what makes
// the commit retry safe.
//
// Invariants:
// - existing article URLs never change (slugs of existing items are stable);
// - a candidate is published at most once (seen_id / source URL checks);
// - a candidate leaves pending only when approved or explicitly rejected;
// - candidates added concurrently by the fetcher are kept.

import { assignSlugs, slugify } from '../../../src/lib/slug.js';
import { CATEGORIES, STATUSES, countSentences, isOriginalSourceUrl, REJECTION_REASONS } from '../../shared/editorial-signals.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class EditorialError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

export function publishedItems(published) {
  if (published && Array.isArray(published.items)) return published.items;
  if (Array.isArray(published)) return published;
  throw new EditorialError('bad_published', 'published.json has an unexpected shape');
}

export function pendingItems(pending) {
  if (Array.isArray(pending)) return pending;
  if (pending && Array.isArray(pending.items)) return pending.items;
  throw new EditorialError('bad_pending', 'pending.json has an unexpected shape');
}

/** The slugs the site derives for every item (the same function src/lib/items.js uses). */
export function computeSlugs(items) {
  return assignSlugs(items);
}

export function nextId(items) {
  let max = 0;
  for (const it of items) {
    const m = /^aw-(\d+)$/.exec(it.id || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `aw-${String(max + 1).padStart(4, '0')}`;
}

function clean(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

/**
 * Validates editable fields. `overrides` may allow a non-two-sentence comment
 * or an aggregator source link, each an explicit owner choice.
 */
export function validateFields(fields, { overrides = {} } = {}) {
  const errors = [];
  const out = {
    title: clean(fields.title, 300),
    comment: clean(fields.comment, 1200),
    category: clean(fields.category, 40),
    source_url: clean(fields.source_url, 1000),
    source_name: clean(fields.source_name, 120),
    date: clean(fields.date, 10),
    status: clean(fields.status || 'REAL', 12),
    city: clean(fields.city, 80),
    state: clean(fields.state, 80),
  };
  if (!out.title) errors.push('title_required');
  if (!out.comment) errors.push('comment_required');
  else if (countSentences(out.comment) !== 2 && !overrides.sentences) errors.push('comment_not_two_sentences');
  if (!CATEGORIES.includes(out.category)) errors.push('bad_category');
  if (!STATUSES.includes(out.status)) errors.push('bad_status');
  if (!DAY.test(out.date)) errors.push('bad_date');
  if (out.status === 'REAL') {
    if (!out.source_url) errors.push('source_url_required');
    else if (!isOriginalSourceUrl(out.source_url) && !overrides.aggregatorSource) errors.push('source_url_not_original');
  }
  if (out.source_url && !/^https?:\/\//i.test(out.source_url)) errors.push('source_url_not_http');
  return { ok: errors.length === 0, fields: out, errors };
}

function buildItem(id, fields, origin) {
  const item = {
    id,
    title: fields.title,
    comment: fields.comment,
    category: fields.category,
    source_url: fields.source_url,
    source_name: fields.source_name,
    date: fields.date,
    status: fields.status,
  };
  if (fields.city) item.city = fields.city;
  if (fields.state) item.state = fields.state;
  if (origin?.source_domain) item.source_domain = origin.source_domain;
  if (origin?.seen_id) item.seen_id = origin.seen_id;
  return item;
}

/** Pins a new item's slug when its title slug is already taken, so no existing URL shifts. */
function protectSlugs(existing, item) {
  const taken = new Set(computeSlugs(existing));
  const base = slugify(item.title) || item.id;
  if (!taken.has(base)) return item;
  const suffix = item.id.replace(/^aw-0*/, '');
  let candidate = `${base}-${suffix}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${suffix}-${n}`;
  item.slug = candidate;
  return item;
}

function sameStory(a, b) {
  if (a.seen_id && b.seen_id && a.seen_id === b.seen_id) return 'seen_id';
  if (a.source_url && b.source_url && a.source_url === b.source_url) return 'source_url';
  return null;
}

/**
 * Approves a batch. approvals: [{ pendingId, fields, overrides }].
 * Returns { published, pending, results: [{ pendingId, outcome, id?, errors? }] }.
 * Invalid entries are reported and skipped; the rest are applied.
 */
export function approveBatch(state, approvals) {
  const pub = publishedItems(state.published);
  const pend = pendingItems(state.pending);
  let newPublished = [...pub];
  const removed = new Set();
  const results = [];
  for (const a of approvals) {
    const orig = pend.find((p) => p.id === a.pendingId);
    if (!orig) { results.push({ pendingId: a.pendingId, outcome: 'not_in_pending' }); continue; }
    const v = validateFields(a.fields, { overrides: a.overrides || {} });
    if (!v.ok) { results.push({ pendingId: a.pendingId, outcome: 'invalid', errors: v.errors }); continue; }
    const candidate = { seen_id: orig.seen_id, source_url: v.fields.source_url };
    const dup = newPublished.find((p) => sameStory(p, candidate));
    if (dup) {
      results.push({ pendingId: a.pendingId, outcome: 'already_published', id: dup.id });
      removed.add(orig.id);
      continue;
    }
    const id = nextId(newPublished);
    const item = protectSlugs(newPublished, buildItem(id, v.fields, orig));
    newPublished = [item, ...newPublished];
    removed.add(orig.id);
    results.push({ pendingId: a.pendingId, outcome: 'approved', id, seen_id: orig.seen_id || null, title: item.title, source_domain: item.source_domain || '' });
  }
  assertSlugsStable(pub, newPublished);
  return {
    published: { ...(Array.isArray(state.published) ? {} : state.published), items: newPublished },
    pending: pend.filter((p) => !removed.has(p.id)),
    results,
  };
}

/** Rejects a batch. rejections: [{ pendingId, reason, note }]. */
export function rejectBatch(state, rejections) {
  const pend = pendingItems(state.pending);
  const removed = new Set();
  const results = [];
  for (const r of rejections) {
    const orig = pend.find((p) => p.id === r.pendingId);
    if (!orig) { results.push({ pendingId: r.pendingId, outcome: 'not_in_pending' }); continue; }
    if (!Object.hasOwn(REJECTION_REASONS, r.reason)) { results.push({ pendingId: r.pendingId, outcome: 'invalid', errors: ['bad_reason'] }); continue; }
    removed.add(orig.id);
    results.push({ pendingId: r.pendingId, outcome: 'rejected', reason: r.reason, seen_id: orig.seen_id || null, title: orig.title, source_domain: orig.source_domain || '' });
  }
  return { published: state.published, pending: pend.filter((p) => !removed.has(p.id)), results };
}

/** Adds a manual item (no pending origin). */
export function addManual(state, fields, overrides = {}) {
  const pub = publishedItems(state.published);
  const v = validateFields(fields, { overrides });
  if (!v.ok) throw new EditorialError('invalid', v.errors.join(','));
  const id = nextId(pub);
  const item = protectSlugs(pub, buildItem(id, v.fields, null));
  const items = [item, ...pub];
  assertSlugsStable(pub, items);
  return { published: { ...state.published, items }, pending: state.pending, results: [{ outcome: 'added', id }] };
}

/** Edits a published item; its URL is pinned when the title changes. */
export function editPublished(state, id, fields, overrides = {}) {
  const pub = publishedItems(state.published);
  const index = pub.findIndex((it) => it.id === id);
  if (index < 0) throw new EditorialError('not_found', `no published item ${id}`);
  const v = validateFields(fields, { overrides });
  if (!v.ok) throw new EditorialError('invalid', v.errors.join(','));
  const slugs = computeSlugs(pub);
  const current = pub[index];
  const next = { ...current, ...buildItem(id, v.fields, current) };
  for (const key of ['city', 'state']) if (!v.fields[key]) delete next[key];
  if (!current.slug && next.title !== current.title) next.slug = slugs[index];
  const items = pub.map((it, i) => (i === index ? next : it));
  assertSlugsStable(pub, items);
  return { published: { ...state.published, items }, pending: state.pending, results: [{ outcome: 'edited', id }] };
}

/** Removes a published item (its URL stops existing; other URLs are unchanged). */
export function deletePublished(state, id) {
  const pub = publishedItems(state.published);
  if (!pub.some((it) => it.id === id)) throw new EditorialError('not_found', `no published item ${id}`);
  const items = pub.filter((it) => it.id !== id);
  // A deletion can move a later duplicate-base item from "-2" to the base slug;
  // pin the survivors' current slugs so their URLs stay.
  const beforeSlugs = computeSlugs(pub);
  const before = new Map(pub.map((it, i) => [it.id, beforeSlugs[i]]));
  const afterSlugs = computeSlugs(items);
  const pinned = items.map((it, i) => (afterSlugs[i] === before.get(it.id) ? it : { ...it, slug: before.get(it.id) }));
  const check = computeSlugs(pinned);
  pinned.forEach((it, i) => {
    if (check[i] !== before.get(it.id)) throw new EditorialError('slug_changed', `${it.id} would move from ${before.get(it.id)} to ${check[i]}`);
  });
  return { published: { ...state.published, items: pinned }, pending: state.pending, results: [{ outcome: 'deleted', id }] };
}

/** Throws unless every item of `before` keeps its slug in `after`. */
export function assertSlugsStable(before, after) {
  const a = computeSlugs(before);
  const b = new Map(computeSlugs(after).map((slug, i) => [after[i].id, slug]));
  before.forEach((it, i) => {
    if (b.has(it.id) && b.get(it.id) !== a[i]) throw new EditorialError('slug_changed', `${it.id} would move from ${a[i]} to ${b.get(it.id)}`);
  });
}

export function serialize(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}
