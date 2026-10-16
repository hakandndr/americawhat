import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { createBoss } from '../workers/boss/src/index.mjs';
import { resetKeyCache } from '../workers/boss/src/auth.mjs';
import { isPreparedDraft, renderReview } from '../workers/boss/src/pages/review.mjs';
import { REVIEW_SCRIPT } from '../workers/boss/src/review-client.mjs';
import { buildReview } from '../workers/shared/editorial-signals.mjs';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { FakeGitHub } from './helpers/fake-github.mjs';
import { AUD, TEAM, makeSigner } from './helpers/access-jwt.mjs';

// Weekly review batch UX: prepared drafts open and selectable, live counts, a
// confirmation preview before the one-commit submit, and a clear distinction
// between pending records and story cards. Nothing is preselected to Approve.

const ready = { comment: 'A fact here. A dry twist.', category: 'only-in-america', status: 'REAL', date: '2026-10-08', source_name: 'KCTV5', source_url: 'https://www.kctv5.com/2026/10/08/iguana/' };
const cand = (id, title, extra = {}) => ({ id, seen_id: `s-${id}`, title, category: 'crime-weird', source_url: '', external_url: `https://news.google.com/rss/articles/${id}`, source_domain: 'example.com', source_name: 'Example', date: '2026-10-10', score: 3, ...extra });
const pending = [
  cand('ready', 'Iguana rescued from tree after a week on the loose', ready),
  cand('agg', 'HOA fined owners for missing fences', { ...ready, source_url: 'https://www.yahoo.com/news/x.html' }),
  cand('one', 'Guinea pig wrangled in a field', { ...ready, comment: 'Only one sentence here.' }),
  cand('plain', 'Raccoon steals a whole pizza from a porch'),
  cand('copy1', 'Bear raids pizza place dumpster at night'),
  cand('copy2', 'Bear raids pizza place dumpster at night', { source_domain: 'other.com' }),
  cand('rej', 'Wallet lost for 51 years turns up', { draft_reason: 'NOT_US', draft_note: 'Canada' }),
];

function render() {
  const html = renderReview({ identity: { email: 'o@example.com' }, review: buildReview(pending, []), fetchStatus: null, csrf: 't' });
  const window = parseHTML(html);
  return { html, window, document: window.document };
}
const card = (document, id) => document.querySelector(`input[type=hidden][value="${id}"]`).closest('article');

test('only complete, override-free drafts count as prepared', () => {
  assert.equal(isPreparedDraft(pending[0]), true);
  assert.equal(isPreparedDraft(pending[1]), false, 'aggregator link needs an override');
  assert.equal(isPreparedDraft(pending[2]), false, 'comment must be two sentences');
  assert.equal(isPreparedDraft(pending[3]), false);
  assert.equal(isPreparedDraft({ ...pending[0], source_url: 'https://news.google.com/rss/articles/x' }), false);
  assert.equal(isPreparedDraft({ ...pending[0], status: 'UNVERIFIED' }), false);
  assert.equal(isPreparedDraft({ ...pending[0], date: '' }), false);
});

test('records and story cards are distinguished; drafts open; nothing is preselected to Approve', () => {
  const { html, document } = render();
  assert.match(html, /<b>7<\/b>pending candidates \(records\)/);
  assert.match(html, /<b>6<\/b>story cards \(distinct stories\)/);
  assert.match(document.getElementById('review-scope').textContent, /7 pending candidates are grouped into 6 story cards: 1 extra copy is listed inside its story's card|7 pending candidates are grouped into 6 story cards: 1 extra copy is listed inside their story's card/);
  assert.equal(document.getElementById('review-tools').hasAttribute('hidden'), true, 'tools appear only when the script runs');
  assert.match(document.querySelector('[data-review="prepared"]').textContent, /Select prepared drafts \(1\)/);
  assert.equal(card(document, 'ready').getAttribute('data-prepared'), '1');
  assert.equal(card(document, 'agg').hasAttribute('data-prepared'), false);
  assert.equal(card(document, 'ready').querySelector('details.editor').hasAttribute('open'), true);
  assert.equal(card(document, 'one').querySelector('details.editor').hasAttribute('open'), true, 'a drafted comment opens even if incomplete');
  assert.equal(card(document, 'plain').querySelector('details.editor').hasAttribute('open'), false);
  assert.equal(document.querySelectorAll('input[type=radio][value=approve][checked]').length, 0);
  assert.equal(card(document, 'rej').querySelector('input[type=radio]:checked').value, 'reject');
  assert.match(html, /<script src="\/assets\/review.js" defer><\/script>/);
});

function runClient() {
  const { document, window } = render();
  // Browser semantics linkedom lacks: checking a radio unchecks its group.
  Object.defineProperty(window.HTMLInputElement.prototype, 'checked', { configurable: true,
    get() { return this.hasAttribute('checked'); },
    set(value) {
      if (value && this.type === 'radio') for (const r of document.querySelectorAll(`input[type=radio][name="${this.name}"]`)) r.removeAttribute('checked');
      this.toggleAttribute('checked', Boolean(value));
    },
  });
  const dialog = document.getElementById('review-preview');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => dialog.removeAttribute('open');
  const form = document.getElementById('review-form');
  let submitted = 0;
  form.requestSubmit = () => { const e = new window.Event('submit', { cancelable: true }); form.dispatchEvent(e); if (!e.defaultPrevented) submitted++; };
  vm.runInNewContext(REVIEW_SCRIPT, { document, window, Number, Array });
  const click = (selector) => document.querySelector(selector).dispatchEvent(new window.Event('click', { bubbles: true }));
  return { document, window, dialog, form, click, submitted: () => submitted };
}

test('client: expand/collapse all, select prepared drafts, live counts', () => {
  const { document, click } = runClient();
  assert.equal(document.getElementById('review-tools').hasAttribute('hidden'), false);
  const counts = () => document.getElementById('review-counts').textContent;
  assert.equal(counts(), 'Story cards: Approve 0 · Reject 1 · Skip 5');
  click('[data-review="expand"]');
  assert.ok([...document.querySelectorAll('details.editor')].every((d) => d.open));
  click('[data-review="collapse"]');
  assert.ok([...document.querySelectorAll('details.editor')].every((d) => !d.open));
  click('[data-review="prepared"]');
  const chosen = (id) => card(document, id).querySelector('input[type=radio]:checked').value;
  assert.equal(chosen('ready'), 'approve');
  for (const id of ['agg', 'one', 'plain', 'copy1', 'rej']) assert.equal(chosen(id), 'skip', id);
  assert.equal(counts(), 'Story cards: Approve 1 · Reject 0 · Skip 5');
});

test('client: Select prepared drafts confirms itself next to the button and follows manual changes', () => {
  const { document, window, form, click } = runClient();
  const button = document.querySelector('[data-review="prepared"]');
  const status = () => document.getElementById('review-prepared-status').textContent;
  assert.equal(status(), '');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  click('[data-review="prepared"]');
  assert.equal(status(), '1 draft selected ✓');
  assert.equal(button.classList.contains('is-selected'), true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  card(document, 'ready').querySelector('input[type=radio][value=skip]').checked = true;
  form.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(status(), '', 'a manual change is reflected');
  assert.equal(button.classList.contains('is-selected'), false);
  card(document, 'ready').querySelector('input[type=radio][value=approve]').checked = true;
  form.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(status(), '1 draft selected ✓');
});

test('client: submit shows a preview of what will be published and rejected; only Confirm submits', () => {
  const { document, dialog, form, click, window, submitted } = runClient();
  click('[data-review="prepared"]');
  card(document, 'rej').querySelector('input[type=radio][value=reject]').checked = true;
  form.dispatchEvent(new window.Event('change', { bubbles: true }));
  const event = new window.Event('submit', { cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, 'the first submit only opens the preview');
  assert.equal(dialog.hasAttribute('open'), true);
  const text = document.getElementById('review-preview-body').textContent;
  assert.match(text, /One commit: 1 to publish, 1 to reject/);
  assert.match(text, /Will be published \(1\)Iguana rescued from tree after a week on the loose — publish as only-in-america/);
  assert.match(text, /Will be rejected \(1\)Wallet lost for 51 years turns up — reject NOT_US/);
  click('[data-review="back"]');
  assert.equal(dialog.hasAttribute('open'), false);
  assert.equal(submitted(), 0);
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  click('[data-review="confirm"]');
  assert.equal(submitted(), 1);
});

test('the review page allows only same-origin scripts and serves review.js after Access', async () => {
  resetKeyCache();
  const signer = makeSigner();
  const gh = new FakeGitHub({ 'src/data/published.json': JSON.stringify({ items: [] }), 'src/data/pending.json': JSON.stringify(pending), 'src/data/fetch-status.json': '{}' });
  const env = {
    APP_DB: D1Sqlite.app(), ANALYTICS_DB: D1Sqlite.analytics(), ENVIRONMENT: 'staging',
    BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net',
    BOSS_CSRF_SECRET: 'test-csrf', BOSS_ORIGIN: 'https://boss.americawhat.com', GITHUB_TOKEN: 't',
    BOSS_GITHUB_REPOSITORY: 'hakandndr/americawhat-staging-content', BOSS_GITHUB_BRANCH: 'content-staging',
    BOSS_COMMIT_AUTHOR_NAME: 'Hakan Dundar', BOSS_COMMIT_AUTHOR_EMAIL: 'hakan@dndr.net',
  };
  const boss = createBoss({ fetchImpl: (url, init) => String(url).includes('/cdn-cgi/access/certs') ? Promise.resolve(new Response(JSON.stringify({ keys: [signer.jwk] }))) : gh.fetch(url, init) });
  const get = (path, auth = true) => boss.fetch(new Request(`https://boss.americawhat.com${path}`, { headers: auth ? { 'Cf-Access-Jwt-Assertion': signer.sign() } : {} }), env);
  const page = await get('/review');
  assert.equal(page.status, 200);
  const csp = page.headers.get('Content-Security-Policy');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*;?\s*script|connect-src/);
  const script = await get('/assets/review.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('Content-Type'), /javascript/);
  assert.equal((await get('/assets/review.js', false)).status, 401);
  const published = await get('/published');
  assert.doesNotMatch(published.headers.get('Content-Security-Policy'), /script-src/);
});
