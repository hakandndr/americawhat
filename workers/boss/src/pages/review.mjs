// Weekly review: a story queue and complete editors in one form. The owner chooses
// approve / reject (with a reason code) / skip for each, and the whole batch
// is one atomic commit. Nothing is approved or removed without that choice.

import { buildReview, CATEGORIES, isPreparedDraft, isOriginalSourceUrl, REJECTION_REASONS, STATUSES } from '../../../shared/editorial-signals.mjs';
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

export { isPreparedDraft };

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
  const prepared = isPreparedDraft(rep);
  // Signals describe the candidate; checks are advisory prompts to read the
  // source. Neither is a decision: only the owner's choice below changes data.
  const signals = [
    `<span class="tag strong">priority ${h(entry.priority)}</span>`,
    `<span class="tag">${h(entry.copies)} cop${entry.copies === 1 ? 'y' : 'ies'}</span>`,
    `<span class="tag geo-${h(entry.geography.verdict)}">${h(entry.geography.verdict)}${entry.geography.evidence.length ? `: ${h(entry.geography.evidence.join(', '))}` : ''}</span>`,
    entry.drafted ? '<span class="tag ok">comment drafted</span>' : '',
    prepared ? '<span class="tag ok">prepared draft</span>' : '',
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
  const n = i + 1;
  // One screen per story: the header carries the decision, the draft sits
  // beside the facts that verify and classify it. Every field stays mounted.
  return `<article class="story${entry.flags.length || entry.publishedMatch ? ' has-flags' : ''}" id="review-story-${i}" data-story-index="${i}" tabindex="-1" aria-labelledby="${titleId}" data-copies="${h(entry.copies)}"${prepared ? ' data-prepared="1"' : ''}>
  ${hidden(`${prefix}id`, rep.id)}${hidden(`${prefix}others`, others.join(','))}
  <header class="story-head">
    <div class="story-heading">
      <h2 class="story-title" id="${titleId}">${h(rep.title)}</h2>
      <p class="story-meta"><span class="story-number">${String(n).padStart(2, '0')}</span>${h(rep.source_name)} · ${h(rep.source_domain)} · ${h(rep.date)} · fetched as <b>${h(rep.category)}</b></p>
      <div class="story-status"><span class="tag ${prepared ? 'ok' : 'warn'}" data-readiness>${prepared ? 'Prepared' : 'Incomplete'}</span>${entry.copies > 1 ? `<span class="tag">${entry.copies} records</span>` : ''}${entry.flags.length || entry.publishedMatch ? '<span class="tag warn">Needs source check</span>' : ''}${draftReason ? `<span class="tag warn">draft: reject ${h(draftReason)}</span>` : ''}<a class="read-source" href="${safeHref(sourceUrl || rep.external_url)}" rel="noreferrer noopener" target="_blank">Read source ↗</a></div>
      <p class="draft-preview" data-draft-preview>${h(rep.comment || '')}</p>
    </div>
    <div class="decide" role="group" aria-label="Decision for story ${n}">
      <div class="choice">
        <label class="a"><input type="radio" name="${prefix}action" value="approve"> Approve <kbd aria-hidden="true">A</kbd></label>
        <label class="r"><input type="radio" name="${prefix}action" value="reject"${action === 'reject' ? ' checked' : ''}> Reject <kbd aria-hidden="true">R</kbd></label>
        <label class="s"><input type="radio" name="${prefix}action" value="skip"${action === 'skip' ? ' checked' : ''}> Skip <kbd aria-hidden="true">S</kbd></label>
      </div>
      <span class="decision-status" data-decision>${draftReason ? 'Selected: reject' : ''}</span>
    </div>
  </header>
  <div class="reject-fields"><label for="${prefix}reason">Rejection reason</label>${select(`${prefix}reason`, [['', 'Choose a reason…'], ...REASON_OPTIONS], draftReason || entry.suggestions[0] || '', ` id="${prefix}reason" aria-label="Rejection reason (used only when Reject is chosen)"`)}
    <input name="${prefix}note" value="${h(drafted?.draft_note || '')}" placeholder="Note (optional)" aria-label="Note"></div>
  ${checks ? `<div class="signals check-strip"><span class="lbl warn">Source checks · advisory</span>${checks}</div>` : ''}
  <div class="editor-fields">
  <div class="editor-main">
  <section class="editor-section" aria-label="Editorial draft"><h3>Editorial draft</h3>
    <div class="field"><label for="${prefix}title">Title</label><textarea class="headline-input" rows="2" id="${prefix}title" name="${prefix}title">${h(rep.title)}</textarea></div>
    <div class="field"><div class="label-row"><label for="${prefix}comment">Comment</label><span class="sentence-count" data-sentences>Exactly two sentences</span></div><textarea class="comment-input" rows="4" id="${prefix}comment" name="${prefix}comment">${h(rep.comment || '')}</textarea></div>
    ${rep.excerpt ? `<div class="story-excerpt"><span class="lbl">Fetched excerpt</span><p>${h(rep.excerpt)}</p></div>` : ''}
  </section>
  <section class="editor-section" aria-label="Duplicates and editorial checks"><h3>Duplicates &amp; checks</h3>
    <div class="signals"><span class="lbl">Signals · advisory, never a decision</span>${signals}</div>
    <p class="field-help">${entry.copies} source record${entry.copies === 1 ? '' : 's'} in this story group</p><ul class="cluster-list">${members}</ul>
    <div class="opts">
    ${others.length ? `<label><input type="checkbox" name="${prefix}dupes" value="1" checked> also remove the ${others.length} other cop${others.length === 1 ? 'y' : 'ies'} as DUPLICATE</label>` : ''}
    <label><input type="checkbox" name="${prefix}ovs" value="1"> allow ≠ 2 sentences</label>
    <label><input type="checkbox" name="${prefix}ova" value="1"> allow aggregator link</label>
    </div>
  </section>
  </div>
  <div class="editor-side">
  <section class="editor-section" aria-label="Source verification"><h3>Source</h3>
    <div class="field"><label for="${prefix}source_url">Original URL <span class="hint">not a Google News link</span></label><input id="${prefix}source_url" name="${prefix}source_url" value="${h(sourceUrl)}" placeholder="https://" inputmode="url"></div>
    <div class="pair"><div class="field"><label for="${prefix}source_name">Source name</label><input id="${prefix}source_name" name="${prefix}source_name" value="${h(rep.source_name)}"></div>
    <div class="field"><label for="${prefix}date">Date</label><input id="${prefix}date" name="${prefix}date" value="${h(rep.date)}" placeholder="YYYY-MM-DD"></div></div>
    <a class="find-source" href="${safeHref(search)}" rel="noreferrer noopener" target="_blank">Find the original article ↗</a>
  </section>
  <section class="editor-section" aria-label="Classification and location"><h3>Classification &amp; place</h3>
    <div class="pair"><div class="field"><label for="${prefix}category">Category</label>${select(`${prefix}category`, CATEGORIES.map((c) => [c, c]), rep.category, ` id="${prefix}category"`)}</div>
    <div class="field"><label for="${prefix}status">Status</label>${select(`${prefix}status`, STATUSES.map((s) => [s, s]), rep.status || 'REAL', ` id="${prefix}status"`)}</div></div>
    <div class="pair"><div class="field"><label for="${prefix}city">City</label><input id="${prefix}city" name="${prefix}city" value="${h(rep.city || '')}"></div>
    <div class="field"><label for="${prefix}state">State</label><input id="${prefix}state" name="${prefix}state" value="${h(rep.state || '')}"></div></div>
  </section>
  </div></div>
</article>`;
}

function storyPicker(entry, i) {
  const rep = entry.representative;
  const ready = isPreparedDraft(rep);
  const check = entry.flags.length || entry.publishedMatch || entry.sourceUnresolved;
  return `<li class="queue-item"><button type="button" class="story-picker" data-story="${i}" title="${h(rep.source_name || rep.source_domain)}" aria-controls="review-story-${i}" aria-pressed="false">
    <span class="queue-rank" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="queue-copy">
    <span class="queue-title">${h(rep.title)}</span><span class="queue-source">${h(rep.date)}</span>
    <span class="queue-status"><span data-queue-category>${h(rep.category)}</span><span data-queue-status>${rep.status && rep.status !== 'REAL' ? h(rep.status) : ''}</span><span data-queue-ready class="${ready ? 'ok' : 'muted'}">${ready ? 'Prepared' : 'Incomplete'}</span>${check ? '<span class="warn">Source check</span>' : ''}${entry.copies > 1 ? `<span>${entry.copies} records</span>` : ''}</span></span>
    <span class="queue-decision" data-queue-decision></span></button></li>`;
}

export function renderReview({ identity, flash, review, fetchStatus, csrf, error }) {
  if (error) return page({ title: 'Weekly review', active: '/review', identity, flash, body: `<div class="flash err" role="alert">${h(error)}</div>` });
  const copies = review.candidates - review.stories;
  const prepared = review.entries.filter((e) => isPreparedDraft(e.representative)).length;
  const body = `
<form method="post" action="/review/apply" id="review-form">
  ${hidden('csrf', csrf)}${hidden('count', review.entries.length)}
  <div class="review-top">
    <div class="review-overview">
      <div class="review-summary">
        <span><b>${review.candidates}</b> pending records</span>
        <span><b>${review.stories}</b> unique stories</span>
        <span><b id="review-ready-count">${prepared}</b> prepared</span>
        ${review.flagged || review.foreign || review.alreadyPublished ? `<span class="summary-risk"><b>${review.flagged}</b> flagged · <b>${review.foreign}</b> likely not US · <b>${review.alreadyPublished}</b> published matches</span>` : ''}
      </div>
      <p class="small muted" id="review-scope">${copies > 0 ? `${copies} duplicate record${copies === 1 ? '' : 's'} grouped. ` : ''}Edits and decisions stay here until confirmation.</p>
    </div>
    <div class="review-apply-bar"><div class="apply-status"><span class="review-counts" id="review-counts" role="status" aria-live="polite"></span><p class="small muted">Hidden and filtered decisions are included.</p></div><button type="submit">Review &amp; Apply</button></div>
  </div>
  <div class="review-workbench" id="review-workbench" data-mobile-view="list">
    <aside class="review-queue" aria-label="Story queue" hidden>
      <div class="review-tools" id="review-tools" hidden>
        <div class="queue-heading"><h2>Queue</h2><span class="small muted" id="review-visible" role="status"></span></div>
        <div class="queue-find"><label class="visually-hidden" for="review-search">Find a story</label><input id="review-search" type="search" aria-label="Search candidates" placeholder="Search stories">
        <select id="review-filter" aria-label="Filter review stories"><option value="all" selected>All stories</option><option value="prepared">Prepared</option><option value="incomplete">Incomplete</option><option value="selected">Decided</option></select></div>
        <div class="queue-bulk"><button type="button" class="secondary" data-review="prepared" aria-pressed="false"${prepared ? '' : ' disabled'}>Select prepared drafts (${prepared})</button><button type="button" class="btn ghost" data-review="reset">Reset to Skip</button></div>
        <span class="review-selected" id="review-prepared-status" role="status" aria-live="polite"></span>
      </div>
      <ul class="story-queue-list">${review.entries.map(storyPicker).join('')}</ul>
      <p class="empty" id="review-no-match" hidden>No matching stories. Change the search or filter. Your edits and decisions are kept.</p>
    </aside>
    <section class="review-detail" aria-label="Story editor">
      <div class="detail-navigation" id="review-detail-navigation" hidden>
        <button type="button" class="secondary back-to-stories" data-review="list">← Queue</button><span id="review-position" role="status" aria-live="polite"></span>
        <span class="key-hint" aria-hidden="true">Keys: <kbd>A</kbd> <kbd>R</kbd> <kbd>S</kbd> decide · <kbd>J</kbd> <kbd>K</kbd> next / previous</span>
        <div class="detail-paging"><button type="button" class="secondary" data-review="previous" aria-label="Previous story">← Previous</button><button type="button" class="secondary" data-review="next" aria-label="Next story">Next →</button></div>
      </div>
      <p class="filter-notice small" id="review-outside-filter" hidden>This story is outside your current filter. Its edits and decision are kept.</p>
      <div class="review-editor-scroll">${review.entries.map(entryCard).join('') || '<div class="empty">No pending candidates. The next fetch will add more.</div>'}</div>
    </section>
  </div>
</form>
<details class="fetch-summary"><summary>Latest fetch details</summary><p class="small muted">${fetchStatusLine(fetchStatus)}</p></details>
<dialog id="review-preview" aria-labelledby="review-preview-title"><h2 id="review-preview-title">Confirm this batch</h2><div id="review-preview-body"></div>
<div class="dialog-actions"><button type="button" class="secondary" data-review="back">Back to the review</button><button type="button" data-review="confirm">Confirm and apply (one commit)</button></div></dialog>
<script src="/assets/review.js" defer></script>`;
  return page({ title: 'Weekly review', active: '/review', identity, flash, body, layout: 'review-workspace' });
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
