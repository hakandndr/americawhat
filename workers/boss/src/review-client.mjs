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
  const workbench = document.getElementById('review-workbench');
  const pickers = Array.from(form.querySelectorAll('[data-story]'));
  const navigation = document.getElementById('review-detail-navigation');
  const position = document.getElementById('review-position');
  let current = cards.length ? 0 : -1;
  let visible = cards.map((_, i) => i);
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
    for (const [index, card] of cards.entries()) {
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
      const picker = pickers[index];
      picker.querySelector('.queue-title').textContent = fields.title || 'Untitled story';
      picker.querySelector('.queue-source').textContent = fields.source_name + ' · ' + fields.date;
      picker.querySelector('[data-queue-category]').textContent = fields.category;
      picker.querySelector('[data-queue-status]').textContent = fields.status;
      picker.querySelector('[data-queue-ready]').textContent = ready ? 'Prepared' : 'Incomplete';
      picker.querySelector('[data-queue-ready]').className = ready ? 'ok' : 'muted';
      picker.querySelector('[data-queue-decision]').textContent = value === 'skip' ? '' : value === 'approve' ? '✓ Approve' : '× Reject';
      picker.setAttribute('data-choice', value);
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
    filterStories();
  }

  function filterStories() {
    const q = search.value.trim().toLowerCase();
    const mode = filter.value;
    visible = [];
    for (const [index, card] of cards.entries()) {
      const ready = card.getAttribute('data-prepared') === '1';
      const matches = !q || ['title', 'comment', 'source_name', 'source_url'].some((name) => field(card, name).value.toLowerCase().includes(q)) || card.querySelector('.story-meta').textContent.toLowerCase().includes(q);
      const shown = matches && (mode === 'all' || mode === 'prepared' && ready || mode === 'incomplete' && !ready || mode === 'selected' && choice(card) !== 'skip');
      pickers[index].closest('li').hidden = !shown;
      if (shown) visible.push(index);
    }
    document.getElementById('review-visible').textContent = visible.length + ' of ' + cards.length + ' stories';
    document.getElementById('review-no-match').hidden = visible.length > 0 || cards.length === 0;
    updateNavigation();
  }

  function updateNavigation() {
    const index = visible.indexOf(current);
    position.textContent = current < 0 ? 'No stories' : 'Story ' + (current + 1) + ' of ' + cards.length;
    document.getElementById('review-outside-filter').hidden = current < 0 || index >= 0;
    navigation.querySelector('[data-review="previous"]').disabled = index <= 0;
    navigation.querySelector('[data-review="next"]').disabled = !visible.length || index === visible.length - 1;
  }

  function showStory(index, openDetail = true) {
    if (!cards[index]) return;
    current = index;
    for (const [i, card] of cards.entries()) {
      card.hidden = i !== current;
      pickers[i].setAttribute('aria-pressed', String(i === current));
    }
    // The form fields remain mounted and enabled: switching/filtering never
    // copies, resets or drops any edit, duplicate option or selected decision.
    if (!window.matchMedia('(max-width:960px)').matches) {
      // Scroll the queue only. scrollIntoView would also move the document
      // when the owner selects a story near the bottom of a long editor.
      const queue = form.querySelector('.story-queue-list');
      const row = pickers[index];
      const top = row.offsetTop - queue.offsetTop;
      if (top < queue.scrollTop || top + row.offsetHeight > queue.scrollTop + queue.clientHeight) queue.scrollTop = top;
    }
    if (openDetail) {
      workbench.setAttribute('data-mobile-view', 'detail');
      navigation.scrollIntoView?.({ block: 'start' });
    }
    updateNavigation();
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
      const kept = Number(card.getAttribute('data-copies') || 1) - 1 - extra;
      const more = extra ? ' · +' + extra + ' duplicate cop' + (extra === 1 ? 'y' : 'ies') + ' removed' : kept ? ' · ' + kept + ' other source record' + (kept === 1 ? '' : 's') + ' left pending' : '';
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
      const remainingStories = cards.length - approve.length - reject.length;
      const remainingRecords = cards.reduce((n, card) => n + Number(card.getAttribute('data-copies') || 1), 0) - approve.length - reject.length - copies;
      p.textContent = 'One commit: ' + approve.length + ' to publish, ' + reject.length + ' to reject' + (copies ? ', plus ' + copies + ' duplicate copies' : '') + '. ' + remainingRecords + ' records stay pending; ' + remainingStories + ' story groups skipped.';
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
  const onEdit = (event) => { if (event.target === form || event.target.closest('article.story')) update(event); };
  form.addEventListener('change', onEdit);
  form.addEventListener('input', onEdit);
  search.addEventListener('input', filterStories);
  filter.addEventListener('change', filterStories);
  document.addEventListener('click', (event) => {
    const picker = event.target.closest('[data-story]');
    if (picker) { showStory(Number(picker.getAttribute('data-story'))); return; }
    const target = event.target.closest('[data-review]');
    if (!target) return;
    const action = target.getAttribute('data-review');
    if (action === 'previous' || action === 'next') {
      const at = visible.indexOf(current);
      showStory(visible[at + (action === 'next' ? 1 : -1)]);
    } else if (action === 'list') {
      workbench.setAttribute('data-mobile-view', 'list');
      pickers[current]?.focus();
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
  workbench.classList.add('is-enhanced');
  form.querySelector('.review-queue').hidden = false;
  navigation.hidden = !cards.length;
  tools.hidden = false;
  update();
  if (cards.length) showStory(0, false);
})();`;
