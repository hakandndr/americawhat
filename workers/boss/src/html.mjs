// Server-rendered Boss HTML. Writes remain plain forms; Analytics enhances
// reads with an authenticated script. Every rendered value is escaped.

export function h(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const PENDING_MARKER = '<!--aw-pending-count-->';
export const PUBLISHED_MARKER = '<!--aw-published-count-->';

/** A count beside a navigation label; empty when the count is unknown. */
function navBadge(count, label, tone = '') {
  if (!Number.isInteger(count) || count < 0) return '';
  return `<span class="nav-count${tone ? ` ${tone}` : ''}" aria-hidden="true">${count}</span><span class="visually-hidden"> (${count} ${label})</span>`;
}

/** The red count beside "Weekly review": records awaiting a decision. */
export function pendingBadge(count) { return navBadge(count, 'pending'); }

/** The neutral count beside "Published": stories live on the site. */
export function publishedBadge(count) { return navBadge(count, 'published', 'neutral'); }

const NAV = [
  ['/review', 'Weekly review'],
  ['/published', 'Published'],
  ['/analytics', 'Analytics'],
  ['/reactions', 'Reactions'],
  ['/audit', 'Audit'],
  ['/health', 'Health'],
];

const NAV_ICONS = [
  '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
  '<path d="M4 5h16v15H4zM8 2v6M16 2v6M4 10h16M8 14h3M8 17h7"/>',
  '<path d="M4 3v17h17M8 16v-5M13 16V6M18 16V9"/>',
  '<path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 1 1 18 0Z"/>',
  '<path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/>',
  '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
];

import { CSS } from './styles.mjs';

export function page({ title, active, identity, body, flash, lede = '', headActions = '', wide = false, layout = '' }) {
  // The Weekly review link carries a marker that index.mjs replaces with the
  // live pending count (or removes when GitHub cannot be read).
  const nav = NAV.map(([href, label], i) => `<a href="${href}"${active === href ? ' class="on" aria-current="page"' : ''}><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[i]}</svg>${h(label)}${href === '/review' ? PENDING_MARKER : href === '/published' ? PUBLISHED_MARKER : ''}</a>`).join('');
  const flashHtml = flash ? `<div class="flash ${flash.type === 'err' ? 'err' : 'ok'}" role="${flash.type === 'err' ? 'alert' : 'status'}">${h(flash.message)}</div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0b1120"><title>${h(title)} · AmericaWhat Boss</title><style>${CSS}</style></head>
<body><a class="skip-link" href="#main-content">Skip to content</a><input class="nav-toggle" type="checkbox" id="nav-toggle" aria-label="Navigation drawer" aria-controls="boss-sidebar">
<header class="mobile-nav"><label class="menu-label" for="nav-toggle">☰ Menu</label><a class="brand" href="/review"><span>america<i>what</i></span><small>Boss</small></a></header>
<label class="drawer-shade" for="nav-toggle" aria-label="Close navigation"></label>
<aside class="sidebar" id="boss-sidebar"><label class="drawer-close" for="nav-toggle">Close menu ×</label><a class="brand" href="/review"><span>america<i>what</i></span><small>Boss</small></a><nav class="nav" aria-label="Boss sections">${nav}</nav><div class="sidebar-footer"><section class="quick-links" aria-labelledby="quick-links-title"><h2 id="quick-links-title">Quick Links</h2><a href="https://americawhat.com/" target="_blank" rel="noopener noreferrer">Live Site ↗</a><a href="https://github.com/hakandndr/americawhat/pulls" target="_blank" rel="noopener noreferrer">GitHub Pull Requests ↗</a><a href="https://github.com/hakandndr/americawhat/actions" target="_blank" rel="noopener noreferrer">GitHub Actions ↗</a><a href="https://github.com/hakandndr/americawhat" target="_blank" rel="noopener noreferrer">Repository ↗</a></section><span class="who">${h(identity?.email || '')}</span></div></aside>
<div class="workspace"><main id="main-content" tabindex="-1" class="${h([wide ? 'analytics-workspace' : '', layout].filter(Boolean).join(' '))}">${flashHtml}<div class="page-head"><h1>${h(title)}</h1>${headActions}${lede ? `<p class="lede">${lede}</p>` : ''}</div>${body}</main></div></body></html>`;
}

/** The environment notice inserted after <body> outside production (see index.mjs). */
export function envBar(label) {
  const [tag, ...rest] = String(label).split(' — ');
  return `<div class="envbar" role="note"><b>${h(tag)}</b><span>${h(rest.join(' — '))}</span></div>`;
}

/** A horizontal bar list for "top N" summaries; values are escaped. */
export function bars(rows, { empty = 'none' } = {}) {
  if (!rows.length) return `<p class="muted small">${h(empty)}</p>`;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return `<ul class="bars">${rows.map((r) => `<li class="bar"><span class="v" title="${h(r.value || '—')}">${h(r.value || '—')}</span><span class="track" aria-hidden="true"><span class="fill" style="width:${Math.max(2, Math.round((r.n / max) * 100))}%"></span></span><span class="n">${r.n}</span></li>`).join('')}</ul>`;
}

export const BOSS_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  // Not 'no-referrer': under it browsers send `Origin: null` on same-origin form
  // POSTs, which checkCsrf rightly refuses. 'same-origin' still sends nothing to
  // other sites (tests/boss-same-origin-post.test.mjs).
  'Referrer-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
});

export function htmlResponse(html, status = 200, { analyticsScript = false, script = false } = {}) {
  const headers = { ...BOSS_HEADERS };
  if (analyticsScript) headers['Content-Security-Policy'] += "; script-src 'self'; connect-src 'self'";
  else if (script) headers['Content-Security-Policy'] += "; script-src 'self'";
  return new Response(html, { status, headers });
}

export function errorPage(status, message) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>${status}</title><p>${h(message)}</p>`, { status, headers: BOSS_HEADERS });
}

/** An href only for http(s) URLs (feed data is untrusted); anything else becomes "#". */
export function safeHref(url) {
  try {
    const u = new URL(String(url ?? ''));
    return u.protocol === 'https:' || u.protocol === 'http:' ? h(u.href) : '#';
  } catch { return '#'; }
}

export function hidden(name, value) {
  return `<input type="hidden" name="${h(name)}" value="${h(value)}">`;
}

export function select(name, options, selected, attrs = '') {
  return `<select name="${h(name)}"${attrs}>${options.map(([v, l]) => `<option value="${h(v)}"${String(v) === String(selected) ? ' selected' : ''}>${h(l)}</option>`).join('')}</select>`;
}

export function redirect(location, flash) {
  const url = new URL(location, 'https://boss.local');
  if (flash) { url.searchParams.set('m', flash.message.slice(0, 300)); url.searchParams.set('t', flash.type); }
  return new Response(null, { status: 303, headers: { Location: `${url.pathname}${url.search}`, 'Cache-Control': 'no-store' } });
}

export function flashFrom(url) {
  const m = url.searchParams.get('m');
  return m ? { message: m, type: url.searchParams.get('t') === 'err' ? 'err' : 'ok' } : null;
}
