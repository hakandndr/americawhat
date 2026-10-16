// Weekly review enhancements, served only after Access verification. The form
// works without it (plain POST, one commit); the script only helps choose and
// shows a confirmation preview first. No inline handlers, framework or eval;
// every value is written with textContent.
import { AGGREGATORS, CATEGORIES, countSentences, isAggregator, isGoogleNewsUrl, isOriginalSourceUrl, isPreparedDraft } from '../../shared/editorial-signals.mjs';

// Embed the same pure validators used on the server; no duplicate readiness rules.
export const REVIEW_SCRIPT = `(() => {
const AGGREGATORS = ${JSON.stringify(AGGREGATORS)}, CATEGORIES = ${JSON.stringify(CATEGORIES)};
${[countSentences, isAggregator, isGoogleNewsUrl, isOriginalSourceUrl, isPreparedDraft].map((fn) => fn.toString()).join('\n')}
` + String.raw`
  'use strict';
  const form = document.getElementById('review-form');
  const tools = document.getElementById('review-tools');
  const dialog = document.getElementById('review-preview');
  if (!form || !tools || !dialog) return;
  const cards = Array.from(form.querySelectorAll('article.story'));
  const counts = document.getElementById('review-counts');
  const preparedButton = tools.querySelector('[data-review="prepared"]');
  const preparedStatus = document.getElementById('review-prepared-status');
  let prepared = cards.filter((card) => card.getAttribute('data-prepared') === '1');
  const search = document.getElementById('review-search');
  const filter = document.getElementById('review-filter');
  const choice = (card) => (card.querySelector('input[type=radio]:checked') || {}).value || 'skip';
  const setChoice = (card, value) => {
    const radio = card.querySelector('input[type=radio][value="' + value + '"]');
    if (radio) radio.checked = true;
  };
  const field = (card, name) => card.querySelector('[name$="_' + name + '"]');
  const title = (card) => {
    const input = field(card, 'title');
    return (input && input.value) || card.querySelector('.story-title').textContent;
  };

  function update(event) {
    const n = { approve: 0, reject: 0, skip: 0 };
    for (const card of cards) {
      const fields = Object.fromEntries(['title', 'comment', 'category', 'source_url', 'source_name', 'date', 'status'].map((name) => [name, field(card, name).value]));
      const ready = isPreparedDraft(fields);
      card.toggleAttribute('data-prepared', ready);
      if (ready) card.setAttribute('data-prepared', '1');
      const badge = card.querySelector('[data-readiness]');
      badge.textContent = ready ? 'Prepared' : 'Incomplete';
      badge.className = 'tag ' + (ready ? 'ok' : 'warn');
      card.querySelector('[data-draft-preview]').textContent = fields.comment;
      card.querySelector('.story-title').textContent = fields.title;
      const value = choice(card);
      n[value] = (n[value] || 0) + 1;
      card.setAttribute('data-choice', value);
      card.querySelector('[data-decision]').textContent = value === 'skip' ? '' : 'Selected: ' + value;
    }
    prepared = cards.filter((card) => card.getAttribute('data-prepared') === '1');
    document.getElementById('review-ready-count').textContent = String(prepared.length);
    preparedButton.disabled = prepared.length === 0;
    preparedButton.textContent = 'Select prepared drafts (' + prepared.length + ')';
    counts.textContent = 'Stories: Approve ' + n.approve + ' · Reject ' + n.reject + ' · Skip ' + n.skip;
    // Reflects the current choices, manual changes included.
    const selected = prepared.filter((card) => choice(card) === 'approve').length;
    const label = selected + ' of ' + prepared.length;
    preparedStatus.textContent = selected === 0 ? ''
      : selected === prepared.length ? selected + ' draft' + (selected === 1 ? '' : 's') + ' selected ✓'
      : label + ' drafts selected';
    preparedButton.classList.toggle('is-selected', selected > 0 && selected === prepared.length);
    preparedButton.setAttribute('aria-pressed', String(selected > 0 && selected === prepared.length));
    // Finishing a draft should not make the form vanish mid-edit under the
    // Incomplete filter. Closing the editor applies the updated filter.
    if (!event || !event.target.closest('details.editor')) filterStories();
  }

  function filterStories() {
    const q = search.value.trim().toLowerCase();
    const mode = filter.value;
    let visible = 0;
    for (const card of cards) {
      const ready = card.getAttribute('data-prepared') === '1';
      const matches = !q || ['title', 'comment', 'source_name', 'source_url'].some((name) => field(card, name).value.toLowerCase().includes(q)) || card.querySelector('.story-meta').textContent.toLowerCase().includes(q);
      card.hidden = !(matches && (mode === 'all' || mode === 'prepared' && ready || mode === 'incomplete' && !ready || mode === 'selected' && choice(card) !== 'skip'));
      if (!card.hidden) visible++;
    }
    document.getElementById('review-visible').textContent = visible + ' of ' + cards.length + ' stories';
    document.getElementById('review-no-match').hidden = visible > 0 || cards.length === 0;
  }

  function item(text, sub) {
    const li = document.createElement('li');
    li.textContent = text;
    if (sub) {
      const small = document.createElement('span');
      small.className = 'muted small';
      small.textContent = ' — ' + sub;
      li.appendChild(small);
    }
    return li;
  }

  function section(body, heading, rows) {
    const h3 = document.createElement('h3');
    h3.textContent = heading + ' (' + rows.length + ')';
    body.appendChild(h3);
    const ul = document.createElement('ul');
    ul.className = 'small';
    for (const row of rows) ul.appendChild(row);
    body.appendChild(ul);
  }

  function preview() {
    const body = document.getElementById('review-preview-body');
    body.textContent = '';
    const approve = [], reject = [];
    let copies = 0;
    for (const card of cards) {
      const value = choice(card);
      if (value === 'skip') continue;
      const dupes = card.querySelector('input[name$="_dupes"]');
      const extra = dupes && dupes.checked ? Number(card.getAttribute('data-copies') || 1) - 1 : 0;
      copies += extra;
      const more = extra ? ' · +' + extra + ' duplicate cop' + (extra === 1 ? 'y' : 'ies') + ' removed' : '';
      if (value === 'approve') {
        const category = field(card, 'category');
        approve.push(item(title(card), 'publish as ' + (category ? category.value : '?') + more));
      } else {
        const reason = field(card, 'reason');
        reject.push(item(title(card), 'reject ' + ((reason && reason.value) || '(no reason chosen)') + more));
      }
    }
    if (!approve.length && !reject.length) {
      const p = document.createElement('p');
      p.textContent = 'No story is set to Approve or Reject. Nothing would change.';
      body.appendChild(p);
    } else {
      const p = document.createElement('p');
      p.className = 'small muted';
      p.textContent = 'One commit: ' + approve.length + ' to publish, ' + reject.length + ' to reject' + (copies ? ', plus ' + copies + ' duplicate copies' : '') + '. Every other story stays pending.';
      body.appendChild(p);
      if (approve.length) section(body, 'Will be published', approve);
      if (reject.length) section(body, 'Will be rejected', reject);
    }
    dialog.querySelector('[data-review="confirm"]').disabled = !approve.length && !reject.length;
    dialog.showModal();
  }

  let confirmed = false;
  form.addEventListener('submit', (event) => {
    if (confirmed) return;
    event.preventDefault();
    preview();
  });
  form.addEventListener('change', update);
  form.addEventListener('input', update);
  search.addEventListener('input', filterStories);
  filter.addEventListener('change', filterStories);
  for (const editor of form.querySelectorAll('details.editor')) editor.addEventListener('toggle', () => { if (!editor.open) filterStories(); });
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-review]');
    if (!target) return;
    const action = target.getAttribute('data-review');
    if (action === 'expand' || action === 'collapse') {
      for (const details of form.querySelectorAll('details.editor')) details.open = action === 'expand';
    } else if (action === 'prepared') {
      for (const card of prepared) if (choice(card) === 'skip') setChoice(card, 'approve');
      update();
    } else if (action === 'reset') {
      for (const card of cards) setChoice(card, 'skip');
      update();
    } else if (action === 'back') {
      dialog.close();
    } else if (action === 'confirm') {
      confirmed = true;
      dialog.close();
      if (form.requestSubmit) form.requestSubmit(); else form.submit();
    }
  });
  tools.hidden = false;
  update();
})();`;
