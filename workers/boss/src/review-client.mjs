// Weekly review enhancements, served only after Access verification. The form
// works without it (plain POST, one commit); the script only helps choose and
// shows a confirmation preview first. No inline handlers, framework or eval;
// every value is written with textContent.
export const REVIEW_SCRIPT = String.raw`(() => {
  'use strict';
  const form = document.getElementById('review-form');
  const tools = document.getElementById('review-tools');
  const dialog = document.getElementById('review-preview');
  if (!form || !tools || !dialog) return;
  const cards = Array.from(form.querySelectorAll('article.story'));
  const counts = document.getElementById('review-counts');
  const preparedButton = tools.querySelector('[data-review="prepared"]');
  const preparedStatus = document.getElementById('review-prepared-status');
  const prepared = cards.filter((card) => card.getAttribute('data-prepared') === '1');
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

  function update() {
    const n = { approve: 0, reject: 0, skip: 0 };
    for (const card of cards) {
      const value = choice(card);
      n[value] = (n[value] || 0) + 1;
      card.setAttribute('data-choice', value);
    }
    counts.textContent = 'Story cards: Approve ' + n.approve + ' · Reject ' + n.reject + ' · Skip ' + n.skip;
    // Reflects the current choices, manual changes included.
    const selected = prepared.filter((card) => choice(card) === 'approve').length;
    const label = selected + ' of ' + prepared.length;
    preparedStatus.textContent = selected === 0 ? ''
      : selected === prepared.length ? selected + ' draft' + (selected === 1 ? '' : 's') + ' selected ✓'
      : label + ' drafts selected';
    preparedButton.classList.toggle('is-selected', selected > 0 && selected === prepared.length);
    preparedButton.setAttribute('aria-pressed', String(selected > 0 && selected === prepared.length));
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
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-review]');
    if (!target) return;
    const action = target.getAttribute('data-review');
    if (action === 'expand' || action === 'collapse') {
      for (const details of form.querySelectorAll('details.editor')) details.open = action === 'expand';
    } else if (action === 'prepared') {
      for (const card of cards) setChoice(card, card.getAttribute('data-prepared') === '1' ? 'approve' : 'skip');
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
