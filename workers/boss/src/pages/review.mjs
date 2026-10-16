// Weekly review: one card per story cluster, ranked; the owner chooses
// approve / reject (with a reason code) / skip for each, and the whole batch
// is one atomic commit. Nothing is approved or removed without that choice.

import { buildReview, CATEGORIES, isOriginalSourceUrl, REJECTION_REASONS, STATUSES } from '../../../shared/editorial-signals.mjs';
import { approveBatch, rejectBatch, serialize } from '../editorial.mjs';
import { CONTENT_PATHS } from '../github.mjs';
import { h, hidden, page, safeHref, select } from '../html.mjs';
import { formatLa } from '../../../shared/time.mjs';

const REASON_OPTIONS = Object.entries(REJECTION_REASONS).map(([k, v]) => [k, `${k} — ${v}`]);

function fetchStatusLine(status) {
  if (!status) return 'Fetch status unavailable.';
  const t = status.totals || {};
  return `Last fetch ${h(status.finishedAt || '?')} · ${h(status.sourcesChecked)} sources · fetched ${h(t.fetched)} · added ${h(t.added)} · duplicate ${h(t.duplicate)} · low score ${h(t.lowScore)} · excluded ${h(t.excluded)}`;
}

function entryCard(entry, i) {
  const rep = entry.representative;
  const prefix = `e${i}_`;
  const sourceUrl = rep.source_url || (isOriginalSourceUrl(rep.external_url) ? rep.external_url : '');
  const others = entry.members.filter((m) => m.id !== rep.id).map((m) => m.id);
  // An editorial draft may propose a rejection (pending.json draft_reason /
  // draft_note, written by scripts/editorial/apply-curation.mjs). It only
  // preselects the choice; nothing changes until the owner submits the form.
  const drafted = [rep, ...entry.members].find((m) => REJECTION_REASONS[m.draft_reason]);
  const draftReason = drafted ? drafted.draft_reason : '';
  const action = draftReason ? 'reject' : 'skip';
  // Signals describe the candidate; checks are advisory prompts to read the
  // source. Neither is a decision: only the owner's choice below changes data.
  const signals = [
    `<span class="tag strong">priority ${h(entry.priority)}</span>`,
    `<span class="tag">${h(entry.copies)} cop${entry.copies === 1 ? 'y' : 'ies'}</span>`,
    `<span class="tag geo-${h(entry.geography.verdict)}">${h(entry.geography.verdict)}${entry.geography.evidence.length ? `: ${h(entry.geography.evidence.join(', '))}` : ''}</span>`,
    entry.drafted ? '<span class="tag ok">comment drafted</span>' : '',
    draftReason ? `<span class="tag warn" title="${h(drafted.draft_note || '')}">draft: reject ${h(draftReason)}</span>` : '',
  ].join('');
  const checks = [
    ...entry.flags.map((f) => `<span class="tag flag" title="Advisory: read the source. Not a rejection.">${h(f.code.replace('HARD_REJECT_', ''))}: ${h(f.terms.join(', '))}</span>`),
    entry.publishedMatch ? `<span class="tag flag" title="Advisory: may already be published.">matches ${h(entry.publishedMatch.id)} (${h(entry.publishedMatch.reason)} ${h(entry.publishedMatch.similarity)})</span>` : '',
    entry.sourceUnresolved ? '<span class="tag warn" title="The fetched link is an aggregator link.">original source not resolved</span>' : '',
  ].join('');
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${rep.title} ${rep.source_domain || ''}`)}`;
  const members = entry.members.map((m) => `<li>${h(m.source_name || m.source_domain)} <span class="muted">${h(m.source_domain)} · ${h(m.date)}</span> — <a href="${safeHref(m.external_url)}" rel="noreferrer noopener" target="_blank">link</a>${m.id === rep.id ? ' <b>(shown)</b>' : ''}</li>`).join('');
  const titleId = `${prefix}t`;
  return `<article class="story${entry.flags.length || entry.publishedMatch ? ' has-flags' : ''}" aria-labelledby="${titleId}">
  ${hidden(`${prefix}id`, rep.id)}${hidden(`${prefix}others`, others.join(','))}
  <div class="story-head"><span class="rank" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div>
  <h2 class="story-title" id="${titleId}">${h(rep.title)}</h2>
  <p class="story-meta">${h(rep.source_name)} · ${h(rep.source_domain)} · ${h(rep.date)} · fetched as <b>${h(rep.category)}</b></p>
  ${rep.excerpt && !String(rep.excerpt).startsWith(rep.title) ? `<p class="story-excerpt">${h(rep.excerpt)}</p>` : ''}
  <div class="signals"><span class="lbl">Signals</span>${signals}</div>
  ${checks ? `<div class="signals"><span class="lbl warn">Check</span>${checks}</div>` : ''}
  <p class="small muted">Read the source before approving. <a href="${safeHref(rep.external_url)}" rel="noreferrer noopener" target="_blank">Open the fetched link</a> · <a href="${safeHref(search)}" rel="noreferrer noopener" target="_blank">Find the original article</a></p>
  </div></div>
  <details class="editor"><summary>Edit the story before approving (${h(entry.copies)} candidate${entry.copies === 1 ? '' : 's'})</summary>
  <div class="grid">
    <div><label for="${prefix}title">Title</label><input id="${prefix}title" name="${prefix}title" value="${h(rep.title)}"></div>
    <div><label for="${prefix}category">Category</label>${select(`${prefix}category`, CATEGORIES.map((c) => [c, c]), rep.category, ` id="${prefix}category"`)}</div>
    <div><label for="${prefix}source_url">Original source URL (not a Google News link)</label><input id="${prefix}source_url" name="${prefix}source_url" value="${h(sourceUrl)}" placeholder="https://"></div>
    <div><label for="${prefix}source_name">Source name</label><input id="${prefix}source_name" name="${prefix}source_name" value="${h(rep.source_name)}"></div>
    <div><label for="${prefix}date">Date</label><input id="${prefix}date" name="${prefix}date" value="${h(rep.date)}"></div>
    <div><label for="${prefix}status">Status</label>${select(`${prefix}status`, STATUSES.map((s) => [s, s]), rep.status || 'REAL', ` id="${prefix}status"`)}</div>
    <div><label for="${prefix}city">City</label><input id="${prefix}city" name="${prefix}city" value="${h(rep.city || '')}"></div>
    <div><label for="${prefix}state">State</label><input id="${prefix}state" name="${prefix}state" value="${h(rep.state || '')}"></div>
  </div>
  <label for="${prefix}comment" style="margin-top:12px">Comment — exactly two sentences</label><textarea id="${prefix}comment" name="${prefix}comment">${h(rep.comment || '')}</textarea>
  <h3 style="margin-top:12px">Candidates in this cluster</h3><ul class="small">${members}</ul>
  </details>
  <div class="decide" role="group" aria-label="Decision for story ${i + 1}">
    <div class="choice">
      <label class="s"><input type="radio" name="${prefix}action" value="skip"${action === 'skip' ? ' checked' : ''}> Skip</label>
      <label class="a"><input type="radio" name="${prefix}action" value="approve"${action === 'approve' ? ' checked' : ''}> Approve</label>
      <label class="r"><input type="radio" name="${prefix}action" value="reject"${action === 'reject' ? ' checked' : ''}> Reject</label>
    </div>
    ${select(`${prefix}reason`, [['', 'Rejection reason…'], ...REASON_OPTIONS], draftReason || entry.suggestions[0] || '', ` aria-label="Rejection reason (used only when Reject is chosen)"`)}
    <input name="${prefix}note" value="${h(drafted?.draft_note || '')}" placeholder="note (optional)" aria-label="Note" style="max-width:240px">
    <div class="opts">
    ${others.length ? `<label><input type="checkbox" name="${prefix}dupes" value="1" checked> also remove the ${others.length} other cop${others.length === 1 ? 'y' : 'ies'} as DUPLICATE</label>` : ''}
    <label><input type="checkbox" name="${prefix}ovs" value="1"> allow ≠ 2 sentences</label>
    <label><input type="checkbox" name="${prefix}ova" value="1"> allow aggregator link</label>
    </div>
  </div>
</article>`;
}

export function renderReview({ identity, flash, review, fetchStatus, csrf, error }) {
  if (error) return page({ title: 'Weekly review', active: '/review', identity, flash, body: `<div class="flash err" role="alert">${h(error)}</div>` });
  const body = `
<div class="stats">
  <div class="stat"><b>${review.candidates}</b>candidates</div>
  <div class="stat"><b>${review.stories}</b>distinct stories</div>
  <div class="stat"><b>${review.flagged}</b>with risk flags</div>
  <div class="stat"><b>${review.foreign}</b>likely not US</div>
  <div class="stat"><b>${review.alreadyPublished}</b>match a published story</div>
</div>
<div class="notice" role="note" style="margin-top:14px"><span class="lbl">How this works</span><span>Stories are ranked by deterministic signals. <span class="warn">Check</span> items are advisory — they mean “read the source”, never an automatic decision. Every story stays <b>Skip</b> until you choose; nothing changes until you apply, and the whole batch is one commit.</span></div>
<form method="post" action="/review/apply">
  ${hidden('csrf', csrf)}${hidden('count', review.entries.length)}
  ${review.entries.map(entryCard).join('') || '<div class="card empty">No pending candidates. The next fetch will add more.</div>'}
  <div class="sticky-submit"><span class="small muted">Only stories set to Approve or Reject are changed. Approval publishes to the site through one Git commit.</span><button type="submit">Apply selected decisions (one commit)</button></div>
</form>`;
  return page({ title: 'Weekly review', active: '/review', identity, flash, body, lede: fetchStatusLine(fetchStatus) });
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
