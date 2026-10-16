// Published items: list, manual add, edit, delete. Every change is one commit.

import { CATEGORIES, STATUSES } from '../../../shared/editorial-signals.mjs';
import { computeSlugs } from '../editorial.mjs';
import { h, hidden, page, select } from '../html.mjs';

export const FIELD_NAMES = ['title', 'comment', 'category', 'source_url', 'source_name', 'date', 'status', 'city', 'state'];
const PER_PAGE = 40;

export function fieldsFromForm(form) {
  return Object.fromEntries(FIELD_NAMES.map((k) => [k, String(form.get(k) ?? '')]));
}

export function overridesFromForm(form) {
  return { sentences: form.get('ovs') === '1', aggregatorSource: form.get('ova') === '1' };
}

function itemForm(item, csrf, action, submitLabel) {
  return `<form method="post" action="${h(action)}" class="card published-editor">
  ${hidden('csrf', csrf)}${item.id ? hidden('id', item.id) : ''}
  <div class="editor-fields">
  <div class="editor-main"><section class="editor-section" aria-label="Story"><h3>Story</h3>
    <div class="field"><label for="p-title">Title</label><textarea class="headline-input" rows="2" id="p-title" name="title">${h(item.title || '')}</textarea></div>
    <div class="field"><label for="p-comment">Comment — exactly two sentences</label><textarea class="comment-input" rows="4" id="p-comment" name="comment">${h(item.comment || '')}</textarea></div>
  </section></div>
  <div class="editor-side"><section class="editor-section" aria-label="Source"><h3>Source</h3>
    <div class="field"><label for="p-source_url">Original source URL</label><input id="p-source_url" name="source_url" value="${h(item.source_url || '')}" placeholder="https://" inputmode="url"></div>
    <div class="pair"><div class="field"><label for="p-source_name">Source name</label><input id="p-source_name" name="source_name" value="${h(item.source_name || '')}"></div>
    <div class="field"><label for="p-date">Date</label><input id="p-date" name="date" value="${h(item.date || new Date().toISOString().slice(0, 10))}"></div></div>
  </section>
  <section class="editor-section" aria-label="Classification and place"><h3>Classification &amp; place</h3>
    <div class="pair"><div class="field"><label for="p-category">Category</label>${select('category', CATEGORIES.map((c) => [c, c]), item.category || 'bureaucracy', ' id="p-category"')}</div>
    <div class="field"><label for="p-status">Status</label>${select('status', STATUSES.map((s) => [s, s]), item.status || 'REAL', ' id="p-status"')}</div></div>
    <div class="pair"><div class="field"><label for="p-city">City</label><input id="p-city" name="city" value="${h(item.city || '')}"></div>
    <div class="field"><label for="p-state">State</label><input id="p-state" name="state" value="${h(item.state || '')}"></div></div>
  </section></div>
  </div>
  <div class="form-foot">
    <div class="opts"><label><input type="checkbox" name="ovs" value="1"> allow ≠ 2 sentences</label>
    <label><input type="checkbox" name="ova" value="1"> allow aggregator link</label></div>
    <div class="actions"><a class="btn ghost" href="/published">Cancel</a><button type="submit">${h(submitLabel)}</button></div>
  </div>
</form>`;
}

function pager(current, pages, link) {
  if (pages <= 1) return '';
  const shown = [...new Set([1, current - 1, current, current + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const parts = [];
  shown.forEach((n, i) => {
    if (i && n - shown[i - 1] > 1) parts.push('<span class="gap" aria-hidden="true">…</span>');
    parts.push(n === current ? `<span class="on" aria-current="page">${n}</span>` : `<a href="${link(n)}">${n}</a>`);
  });
  return `<nav class="pager" aria-label="Pages">${current > 1 ? `<a href="${link(current - 1)}" rel="prev">← Newer</a>` : ''}${parts.join('')}${current < pages ? `<a href="${link(current + 1)}" rel="next">Older →</a>` : ''}</nav>`;
}

export function renderPublishedList({ identity, flash, items, query, cat = '', pageNo = 1 }) {
  const q = String(query || '').toLowerCase();
  const category = CATEGORIES.includes(cat) ? cat : '';
  const slugs = computeSlugs(items);
  const rows = items.map((it, i) => ({ it, slug: slugs[i] }))
    .filter(({ it }) => !category || it.category === category)
    .filter(({ it }) => !q || `${it.id} ${it.title} ${it.category} ${it.city || ''} ${it.state || ''}`.toLowerCase().includes(q));
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(Math.max(1, Number.parseInt(pageNo, 10) || 1), pages);
  const slice = rows.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const link = (n) => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (category) p.set('cat', category);
    if (n > 1) p.set('p', String(n));
    const s = p.toString();
    return `/published${s ? `?${h(s)}` : ''}`;
  };
  const statusCell = (s) => (s && s !== 'REAL' ? `<span class="tag warn">${h(s)}</span>` : `<span class="faint">${h(s || '')}</span>`);
  const body = `
<form method="get" action="/published" class="toolbar" role="search">
  <input name="q" value="${h(query || '')}" placeholder="Search id, title, category, place" aria-label="Search published stories">
  ${select('cat', [['', 'All categories'], ...CATEGORIES.map((c) => [c, c])], category, ' aria-label="Category" style="width:auto"')}
  <button class="secondary">Search</button>${q || category ? '<a class="btn ghost" href="/published">Clear</a>' : ''}
</form>
<div class="table-card"><div class="scroll" tabindex="0" role="region" aria-label="Published stories"><table class="published-table"><thead><tr><th scope="col">ID</th><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Story · live URL</th><th scope="col">Place</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Edit</span></th></tr></thead><tbody>
${slice.map(({ it, slug }) => `<tr><td class="mono id-cell" data-label="ID">${h(it.id)}</td><td data-label="Date">${h(it.date)}</td><td data-label="Category"><span class="tag">${h(it.category)}</span></td><td class="wrap" data-label="Story"><a class="headline" href="https://americawhat.com/item/${h(slug)}/" target="_blank" rel="noopener noreferrer">${h(it.title)}</a><span class="sub live-path mono"><a class="clip" href="https://americawhat.com/item/${h(slug)}/" title="https://americawhat.com/item/${h(slug)}/" target="_blank" rel="noopener noreferrer" aria-label="Live URL /item/${h(slug)}/">/item/${h(slug)}/</a></span></td><td data-label="Place">${h([it.city, it.state].filter(Boolean).join(', ')) || '<span class="faint">—</span>'}</td><td data-label="Status">${statusCell(it.status)}</td><td data-label="Manage"><a class="btn secondary" href="/published/edit?id=${encodeURIComponent(it.id)}" aria-label="Edit ${h(it.id)}">Edit</a></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No published story matches this search.</td></tr>'}
</tbody></table></div>
<div class="table-foot"><span class="faint small">${rows.length ? `${(current - 1) * PER_PAGE + 1}–${Math.min(current * PER_PAGE, rows.length)} of ` : ''}${rows.length} matching · ${items.length} published in total</span>${pager(current, pages, link)}</div></div>`;
  return page({
    title: 'Published', active: '/published', identity, flash, body,
    headActions: '<a class="btn" href="/published/new">Add a story manually</a>',
    lede: `${rows.length} of ${items.length} items · newest first · URLs shown are the live article paths and never change on edit.`,
  });
}

export function renderEdit({ identity, flash, item, csrf }) {
  const body = `${itemForm(item, csrf, '/published/edit', 'Save (one commit)')}
<form method="post" action="/published/delete" class="card danger-zone">
  ${hidden('csrf', csrf)}${hidden('id', item.id)}
  <h2>Delete this story</h2>
  <p>Removes the story from the site; its URL will stop working. Type the id <b class="mono">${h(item.id)}</b> to confirm.</p>
  <div class="actions"><label for="del-confirm" class="muted">Story id</label><input id="del-confirm" name="confirm" placeholder="${h(item.id)}" style="max-width:200px" autocomplete="off"><button class="danger" type="submit">Delete</button></div>
</form>`;
  return page({ title: `Edit ${item.id}`, active: '/published', identity, flash, body, layout: 'form-workspace', lede: 'Saving creates one commit. The live URL stays the same even if the title changes.' });
}

export function renderNew({ identity, flash, csrf }) {
  return page({ title: 'Add a story', active: '/published', identity, flash, layout: 'form-workspace', body: itemForm({}, csrf, '/published/new', 'Publish (one commit)'), lede: 'A manually added story is published with one commit, after the same checks as the weekly review.' });
}
