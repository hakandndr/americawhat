// Weekly review: one card per story cluster, ranked; the owner chooses
// approve / reject (with a reason code) / skip for each, and the whole batch
// is one atomic commit. Nothing is approved or removed without that choice.

import { buildReview, CATEGORIES, isOriginalSourceUrl, REJECTION_REASONS, STATUSES } from '../../../shared/editorial-signals.mjs';
import { approveBatch, rejectBatch, serialize } from '../editorial.mjs';
import { CONTENT_PATHS } from '../github.mjs';
import { h, hidden, page, select } from '../html.mjs';
import { formatLa } from '../../../shared/time.mjs';

const REASON_OPTIONS = Object.entries(REJECTION_REASONS).map(([k, v]) => [k, `${k} — ${v}`]);

function fetchStatusLine(status) {
  if (!status) return '<p class="muted">Fetch status unavailable.</p>';
  const t = status.totals || {};
  return `<p class="muted">Last fetch ${h(status.finishedAt || '?')} · ${h(status.sourcesChecked)} sources · fetched ${h(t.fetched)} · added ${h(t.added)} · duplicate ${h(t.duplicate)} · low score ${h(t.lowScore)} · excluded ${h(t.excluded)}</p>`;
}

function entryCard(entry, i) {
  const rep = entry.representative;
  const prefix = `e${i}_`;
  const sourceUrl = rep.source_url || (isOriginalSourceUrl(rep.external_url) ? rep.external_url : '');
  const others = entry.members.filter((m) => m.id !== rep.id).map((m) => m.id);
  const tags = [
    `<span class="tag">priority ${h(entry.priority)}</span>`,
    `<span class="tag">${h(entry.copies)} cop${entry.copies === 1 ? 'y' : 'ies'}</span>`,
    `<span class="tag geo-${h(entry.geography.verdict)}">${h(entry.geography.verdict)}${entry.geography.evidence.length ? `: ${h(entry.geography.evidence.join(', '))}` : ''}</span>`,
    ...entry.flags.map((f) => `<span class="tag flag">${h(f.code.replace('HARD_REJECT_', ''))}: ${h(f.terms.join(', '))}</span>`),
    entry.publishedMatch ? `<span class="tag flag">matches ${h(entry.publishedMatch.id)} (${h(entry.publishedMatch.reason)} ${h(entry.publishedMatch.similarity)})</span>` : '',
    entry.sourceUnresolved ? '<span class="tag warn">original source not resolved</span>' : '',
    entry.drafted ? '<span class="tag ok">comment drafted</span>' : '',
  ].join('');
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${rep.title} ${rep.source_domain || ''}`)}`;
  const members = entry.members.map((m) => `<li>${h(m.source_name || m.source_domain)} <span class="muted">${h(m.source_domain)} · ${h(m.date)}</span> — <a href="${h(m.external_url)}" rel="noreferrer noopener" target="_blank">link</a>${m.id === rep.id ? ' <b>(shown)</b>' : ''}</li>`).join('');
  return `<div class="card">
  ${hidden(`${prefix}id`, rep.id)}${hidden(`${prefix}others`, others.join(','))}
  <div>${tags}</div>
  <p><b>${h(rep.title)}</b><br><span class="muted">${h(rep.source_name)} · ${h(rep.source_domain)} · ${h(rep.date)} · fetched as ${h(rep.category)}</span></p>
  ${rep.excerpt ? `<p class="muted">${h(rep.excerpt)}</p>` : ''}
  <p class="muted">Read the source before approving. <a href="${h(rep.external_url)}" rel="noreferrer noopener" target="_blank">Open the fetched link</a> · <a href="${h(search)}" rel="noreferrer noopener" target="_blank">find the original article</a></p>
  <details><summary>Edit the story (${h(entry.copies)} candidate${entry.copies === 1 ? '' : 's'})</summary>
  <div class="grid">
    <div><label>Title</label><input name="${prefix}title" value="${h(rep.title)}"></div>
    <div><label>Category</label>${select(`${prefix}category`, CATEGORIES.map((c) => [c, c]), rep.category)}</div>
    <div><label>Original source URL (not a Google News link)</label><input name="${prefix}source_url" value="${h(sourceUrl)}" placeholder="https://"></div>
    <div><label>Source name</label><input name="${prefix}source_name" value="${h(rep.source_name)}"></div>
    <div><label>Date</label><input name="${prefix}date" value="${h(rep.date)}"></div>
    <div><label>Status</label>${select(`${prefix}status`, STATUSES.map((s) => [s, s]), rep.status || 'REAL')}</div>
    <div><label>City</label><input name="${prefix}city" value="${h(rep.city || '')}"></div>
    <div><label>State</label><input name="${prefix}state" value="${h(rep.state || '')}"></div>
  </div>
  <label>Comment — exactly two sentences</label><textarea name="${prefix}comment">${h(rep.comment || '')}</textarea>
  <ul>${members}</ul>
  </details>
  <div class="actions">
    <label><input type="radio" name="${prefix}action" value="skip" checked> skip</label>
    <label><input type="radio" name="${prefix}action" value="approve"> approve</label>
    <label><input type="radio" name="${prefix}action" value="reject"> reject</label>
    ${select(`${prefix}reason`, [['', 'reason…'], ...REASON_OPTIONS], entry.suggestions[0] || '')}
    <input name="${prefix}note" placeholder="note (optional)" style="max-width:260px">
    ${others.length ? `<label><input type="checkbox" name="${prefix}dupes" value="1" checked> also remove the ${others.length} other cop${others.length === 1 ? 'y' : 'ies'} as DUPLICATE</label>` : ''}
    <label><input type="checkbox" name="${prefix}ovs" value="1"> allow ≠ 2 sentences</label>
    <label><input type="checkbox" name="${prefix}ova" value="1"> allow aggregator link</label>
  </div>
</div>`;
}

export function renderReview({ identity, flash, review, fetchStatus, csrf, error }) {
  if (error) return page({ title: 'Weekly review', active: '/review', identity, flash, body: `<div class="flash err">${h(error)}</div>` });
  const body = `
${fetchStatusLine(fetchStatus)}
<div class="stats">
  <div class="stat"><b>${review.candidates}</b>candidates</div>
  <div class="stat"><b>${review.stories}</b>distinct stories</div>
  <div class="stat"><b>${review.flagged}</b>with risk flags</div>
  <div class="stat"><b>${review.foreign}</b>likely not US</div>
  <div class="stat"><b>${review.alreadyPublished}</b>match a published story</div>
</div>
<p class="muted">Ranked by deterministic signals; flags mean "read the source", never an automatic decision. Choose an action per story; nothing changes until you submit, and the batch is one commit.</p>
<form method="post" action="/review/apply">
  ${hidden('csrf', csrf)}${hidden('count', review.entries.length)}
  ${review.entries.map(entryCard).join('')}
  <p><button type="submit">Apply selected decisions (one commit)</button></p>
</form>`;
  return page({ title: 'Weekly review', active: '/review', identity, flash, body });
}

/** Parses the review form into approvals and rejections. */
export function parseReviewForm(form) {
  const count = Math.min(Number(form.get('count') || 0), 1000);
  const approvals = [];
  const rejections = [];
  const errors = [];
  for (let i = 0; i < count; i++) {
    const p = `e${i}_`;
    const action = String(form.get(`${p}action`) || 'skip');
    const pendingId = String(form.get(`${p}id`) || '');
    if (!pendingId || action === 'skip') continue;
    const others = String(form.get(`${p}others`) || '').split(',').filter(Boolean);
    const dupes = form.get(`${p}dupes`) === '1';
    if (action === 'approve') {
      approvals.push({
        pendingId,
        fields: Object.fromEntries(['title', 'comment', 'category', 'source_url', 'source_name', 'date', 'status', 'city', 'state'].map((k) => [k, String(form.get(`${p}${k}`) ?? '')])),
        overrides: { sentences: form.get(`${p}ovs`) === '1', aggregatorSource: form.get(`${p}ova`) === '1' },
      });
    } else if (action === 'reject') {
      const reason = String(form.get(`${p}reason`) || '');
      if (!reason) { errors.push(`${pendingId}: choose a rejection reason`); continue; }
      rejections.push({ pendingId, reason, note: String(form.get(`${p}note`) || '').slice(0, 300) });
    }
    if (dupes) for (const id of others) rejections.push({ pendingId: id, reason: 'DUPLICATE', note: `copy of ${pendingId}` });
  }
  return { approvals, rejections, errors };
}

/** The compute step of the review transaction. */
export function reviewCompute(approvals, rejections) {
  return (files) => {
    const state = { published: JSON.parse(files[CONTENT_PATHS.published]), pending: JSON.parse(files[CONTENT_PATHS.pending]) };
    const approved = approveBatch(state, approvals);
    // A copy of a story that was just approved must not be "rejected" if it was the approved one.
    const approvedIds = new Set(approvals.map((a) => a.pendingId));
    const rejected = rejectBatch({ published: approved.published, pending: approved.pending }, rejections.filter((r) => !approvedIds.has(r.pendingId)));
    return {
      files: { [CONTENT_PATHS.published]: serialize(rejected.published), [CONTENT_PATHS.pending]: serialize(rejected.pending) },
      result: [...approved.results, ...rejected.results],
    };
  };
}

export function reviewSummary(results) {
  const n = (o) => results.filter((r) => r.outcome === o).length;
  return { approved: n('approved'), rejected: n('rejected'), invalid: n('invalid'), alreadyPublished: n('already_published'), missing: n('not_in_pending') };
}

export function describeResults(results) {
  return results.filter((r) => r.outcome === 'invalid').map((r) => `${r.pendingId}: ${(r.errors || []).join(', ')}`).join(' · ');
}

export { formatLa };
