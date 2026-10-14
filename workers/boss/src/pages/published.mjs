// Published items: list, manual add, edit, delete. Every change is one commit.

import { CATEGORIES, STATUSES } from '../../../shared/editorial-signals.mjs';
import { computeSlugs } from '../editorial.mjs';
import { h, hidden, page, select } from '../html.mjs';

export const FIELD_NAMES = ['title', 'comment', 'category', 'source_url', 'source_name', 'date', 'status', 'city', 'state'];

export function fieldsFromForm(form) {
  return Object.fromEntries(FIELD_NAMES.map((k) => [k, String(form.get(k) ?? '')]));
}

export function overridesFromForm(form) {
  return { sentences: form.get('ovs') === '1', aggregatorSource: form.get('ova') === '1' };
}

function itemForm(item, csrf, action, submitLabel) {
  return `<form method="post" action="${h(action)}" class="card">
  ${hidden('csrf', csrf)}${item.id ? hidden('id', item.id) : ''}
  <div class="grid">
    <div><label>Title</label><input name="title" value="${h(item.title || '')}"></div>
    <div><label>Category</label>${select('category', CATEGORIES.map((c) => [c, c]), item.category || 'bureaucracy')}</div>
    <div><label>Original source URL</label><input name="source_url" value="${h(item.source_url || '')}"></div>
    <div><label>Source name</label><input name="source_name" value="${h(item.source_name || '')}"></div>
    <div><label>Date</label><input name="date" value="${h(item.date || new Date().toISOString().slice(0, 10))}"></div>
    <div><label>Status</label>${select('status', STATUSES.map((s) => [s, s]), item.status || 'REAL')}</div>
    <div><label>City</label><input name="city" value="${h(item.city || '')}"></div>
    <div><label>State</label><input name="state" value="${h(item.state || '')}"></div>
  </div>
  <label>Comment — exactly two sentences</label><textarea name="comment">${h(item.comment || '')}</textarea>
  <div class="actions">
    <label><input type="checkbox" name="ovs" value="1"> allow ≠ 2 sentences</label>
    <label><input type="checkbox" name="ova" value="1"> allow aggregator link</label>
    <button type="submit">${h(submitLabel)}</button>
  </div>
</form>`;
}

export function renderPublishedList({ identity, flash, items, query }) {
  const q = String(query || '').toLowerCase();
  const slugs = computeSlugs(items);
  const rows = items.map((it, i) => ({ it, slug: slugs[i] }))
    .filter(({ it }) => !q || `${it.id} ${it.title} ${it.category} ${it.city || ''} ${it.state || ''}`.toLowerCase().includes(q));
  const body = `
<form method="get" action="/published" class="actions"><input name="q" value="${h(query || '')}" placeholder="search" style="max-width:320px"><button class="secondary">Search</button>
<a class="btn" href="/published/new">Add a story manually</a></form>
<p class="muted">${rows.length} of ${items.length} items · newest first · URLs shown are the live article paths and never change on edit.</p>
<div class="scroll"><table><thead><tr><th>ID</th><th>Date</th><th>Category</th><th>Title</th><th>Place</th><th>Status</th><th>URL</th><th></th></tr></thead><tbody>
${rows.map(({ it, slug }) => `<tr><td>${h(it.id)}</td><td>${h(it.date)}</td><td>${h(it.category)}</td><td class="wrap">${h(it.title)}</td><td>${h([it.city, it.state].filter(Boolean).join(', '))}</td><td>${h(it.status || '')}</td><td>/item/${h(slug)}/</td><td><a href="/published/edit?id=${encodeURIComponent(it.id)}">edit</a></td></tr>`).join('')}
</tbody></table></div>`;
  return page({ title: 'Published', active: '/published', identity, flash, body });
}

export function renderEdit({ identity, flash, item, csrf }) {
  const body = `${itemForm(item, csrf, '/published/edit', 'Save (one commit)')}
<form method="post" action="/published/delete" class="card">
  ${hidden('csrf', csrf)}${hidden('id', item.id)}
  <p class="bad">Delete this story from the site. Its URL will stop working; type the id to confirm.</p>
  <div class="actions"><input name="confirm" placeholder="${h(item.id)}" style="max-width:200px"><button class="danger" type="submit">Delete</button></div>
</form>`;
  return page({ title: `Edit ${item.id}`, active: '/published', identity, flash, body });
}

export function renderNew({ identity, flash, csrf }) {
  return page({ title: 'Add a story', active: '/published', identity, flash, body: itemForm({}, csrf, '/published/new', 'Publish (one commit)') });
}
