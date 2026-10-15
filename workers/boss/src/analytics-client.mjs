// Served only after Access verification. No inline handlers, framework or eval.
export const ANALYTICS_SCRIPT = String.raw`(() => {
  'use strict';
  const form = document.getElementById('analytics-filters');
  if (!form) return;
  const status = document.getElementById('analytics-status');
  const regions = ['analytics-retention', 'analytics-metrics', 'analytics-events', 'analytics-breakdowns'];
  let timer, controller, generation = 0, composing = false;
  function message(text, error = false) {
    status.textContent = text;
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function busy(value) {
    for (const id of regions) document.getElementById(id)?.setAttribute('aria-busy', String(value));
  }
  function invalidate() {
    generation++;
    clearTimeout(timer);
    controller?.abort();
    busy(false);
  }
  function syncForm(url) {
    for (const input of form.querySelectorAll('[name]')) input.value = url.searchParams.get(input.name) || (input.name === 'range' ? 'all' : input.name === 'limit' ? '50' : '');
  }
  function validDates() {
    let valid = true;
    for (const name of ['from', 'to']) {
      const input = form.querySelector('[name="' + name + '"]');
      const value = input.value;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
      const ok = !value || day;
      input.setAttribute('aria-invalid', String(!ok));
      valid = valid && ok;
    }
    const from = form.querySelector('[name="from"]').value, to = form.querySelector('[name="to"]').value;
    return valid && (!from || !to || from <= to);
  }
  function filterUrl() {
    const url = new URL('/analytics', location.origin);
    for (const input of form.querySelectorAll('[name]')) {
      if (input.value && !(input.name === 'range' && input.value === 'all') && !(input.name === 'limit' && input.value === '50')) url.searchParams.set(input.name, input.value);
    }
    return url;
  }
  async function navigate(url, { history = true, sync = false, pager = false } = {}) {
    if (url.origin !== location.origin || url.pathname !== '/analytics') return;
    invalidate();
    const version = generation;
    controller = new AbortController();
    if (sync) syncForm(url);
    busy(true); message('Updating…');
    try {
      const response = await fetch(url.href, { credentials: 'same-origin', redirect: 'error', signal: controller.signal, headers: { Accept: 'text/html' } });
      if (!response.ok || !(response.headers.get('Content-Type') || '').includes('text/html')) throw new Error('response');
      const incoming = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (version !== generation) return;
      if (!incoming.getElementById('analytics-filters') || regions.some(id => !incoming.getElementById(id))) throw new Error('session');
      for (const id of regions) document.getElementById(id).replaceWith(incoming.getElementById(id));
      const lede = document.querySelector('.page-head .lede');
      if (lede) lede.textContent = incoming.querySelector('.page-head .lede').textContent;
      const range = document.querySelector('[aria-label="Date range"]');
      if (range) range.replaceWith(incoming.querySelector('[aria-label="Date range"]'));
      const links = incoming.querySelectorAll('[data-analytics-export]');
      document.querySelectorAll('[data-analytics-export]').forEach((link, i) => link.setAttribute('href', links[i].getAttribute('href')));
      if (history && location.pathname + location.search !== url.pathname + url.search) window.history.pushState(null, '', url.pathname + url.search);
      if (pager) { const heading = document.getElementById('h-events'); heading.setAttribute('tabindex', '-1'); heading.focus(); }
      message('Updated.');
    } catch (error) {
      if (version === generation && error.name !== 'AbortError') message('Could not update. Results are unchanged. Retry with Apply filters or reload to sign in again.', true);
    } finally { if (version === generation) busy(false); }
  }
  function apply(immediate = false) {
    invalidate();
    if (composing || !validDates()) { message('Complete valid dates (YYYY-MM-DD), with From before To.'); return; }
    if (immediate) void navigate(filterUrl());
    else { message('Waiting…'); timer = setTimeout(() => { void navigate(filterUrl()); }, 350); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); apply(true); });
  form.addEventListener('input', event => { if (event.target.tagName === 'INPUT') apply(); });
  form.addEventListener('change', event => { if (event.target.tagName === 'SELECT') apply(true); });
  form.addEventListener('compositionstart', () => { composing = true; invalidate(); });
  form.addEventListener('compositionend', () => { composing = false; apply(); });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-analytics-nav],a[data-analytics-reset]');
    if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void navigate(new URL(link.getAttribute('href'), location.origin), { sync: true, pager: !!link.closest('#analytics-events') });
  });
  document.addEventListener('change', event => {
    if (event.target.id !== 'analytics-page') return;
    const url = new URL(event.target.form.getAttribute('data-page-url'), location.origin);
    url.searchParams.set('p', event.target.value);
    void navigate(url, { pager: true });
  });
  window.addEventListener('popstate', () => { void navigate(new URL(location.href), { history: false, sync: true }); });
})();`;
