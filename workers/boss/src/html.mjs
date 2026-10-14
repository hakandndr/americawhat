// Minimal server-rendered HTML for Boss. No client JavaScript: every action is
// a plain form, every value is escaped.

export function h(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const NAV = [
  ['/review', 'Weekly review'],
  ['/published', 'Published'],
  ['/analytics', 'Analytics'],
  ['/reactions', 'Reactions'],
  ['/audit', 'Audit'],
  ['/health', 'Health'],
];

const CSS = `
:root{color-scheme:light dark;--bg:#111;--panel:#1b1b1b;--line:#333;--text:#eee;--muted:#9a9a9a;--accent:#ffcc00;--bad:#ff6b6b;--ok:#7bd88f;--warn:#ffb347}
@media (prefers-color-scheme: light){:root{--bg:#f6f6f4;--panel:#fff;--line:#ddd;--text:#141414;--muted:#666;--accent:#b38600;--bad:#c62828;--ok:#2e7d32;--warn:#b26a00}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel)}
header b{color:var(--accent);letter-spacing:.04em}header nav a{color:var(--text);text-decoration:none;padding:4px 6px;border-radius:4px}
header nav a.on{background:var(--accent);color:#000}header .who{margin-left:auto;color:var(--muted);font-size:12px}
main{padding:16px;max-width:1500px;margin:0 auto}h1{font-size:20px;margin:4px 0 12px}h2{font-size:16px;margin:20px 0 8px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;margin:10px 0}
.muted{color:var(--muted)}.bad{color:var(--bad)}.ok{color:var(--ok)}.warn{color:var(--warn)}
.flash{padding:10px 12px;border-radius:6px;margin:8px 0;border:1px solid var(--line)}.flash.err{border-color:var(--bad)}.flash.ok{border-color:var(--ok)}
.grid{display:grid;gap:8px 12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
label{display:block;font-size:12px;color:var(--muted)}input,select,textarea{width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:5px;padding:6px 8px;font:inherit}
textarea{min-height:64px}button,.btn{background:var(--accent);color:#000;border:0;border-radius:5px;padding:7px 12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
button.secondary{background:transparent;color:var(--text);border:1px solid var(--line)}button.danger{background:var(--bad);color:#fff}
.tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:10px;border:1px solid var(--line);margin:0 4px 2px 0}
.tag.flag{border-color:var(--bad);color:var(--bad)}.tag.geo-foreign_likely{border-color:var(--warn);color:var(--warn)}.tag.geo-us_likely{border-color:var(--ok);color:var(--ok)}
.stats{display:flex;flex-wrap:wrap;gap:8px}.stat{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 10px;min-width:110px}.stat b{display:block;font-size:18px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top;white-space:nowrap}
td.wrap{white-space:normal;min-width:220px;max-width:420px;word-break:break-word}details summary{cursor:pointer;color:var(--muted)}
.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.actions label{display:inline-flex;gap:4px;align-items:center;color:var(--text);font-size:13px}.actions input{width:auto}
`;

export function page({ title, active, identity, body, flash }) {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${active === href ? ' class="on"' : ''}>${h(label)}</a>`).join('');
  const flashHtml = flash ? `<div class="flash ${flash.type === 'err' ? 'err' : 'ok'}">${h(flash.message)}</div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${h(title)} · AmericaWhat Boss</title><style>${CSS}</style></head>
<body><header><b>AMERICAWHAT BOSS</b><nav>${nav}</nav><span class="who">${h(identity?.email || '')}</span></header>
<main>${flashHtml}<h1>${h(title)}</h1>${body}</main></body></html>`;
}

export const BOSS_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
});

export function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: BOSS_HEADERS });
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

export function select(name, options, selected) {
  return `<select name="${h(name)}">${options.map(([v, l]) => `<option value="${h(v)}"${String(v) === String(selected) ? ' selected' : ''}>${h(l)}</option>`).join('')}</select>`;
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
