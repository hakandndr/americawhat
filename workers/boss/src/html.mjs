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

// Match src/styles/global.css without importing Astro CSS into this Worker.
// Small muted labels use public --dim: --dim-2 is below 4.5:1 on cards.
// Filled actions use slightly darker brand reds for AA contrast with white text.
// Semantic colours: ok = green, warn = amber (advisory only), bad = red text,
// info = blue (environment, neutral highlights). The accent is the brand red.
const CSS = `
:root{color-scheme:dark;
--bg:#0b1120;--bg-2:#0f1830;--panel:#111c34;--panel-2:#0f1830;--sunk:#0b1120;--header:rgba(11,17,32,.82);
--line:rgba(142,160,201,.16);--line-2:rgba(142,160,201,.28);--line-3:rgba(142,160,201,.42);--control-line:var(--muted);
--text:#eef2ff;--muted:#8ea0c9;--faint:#8ea0c9;
--accent:#e23b4e;--accent-strong:#d9364a;--accent-hover:#cf3044;--accent-active:#c82d41;--accent-text:#ff5468;--on-accent:#fff;
--focus:var(--accent-text);--focus-soft:rgba(255,84,104,.12);
--ok:#6fd3a6;--ok-soft:rgba(111,211,166,.12);--ok-line:rgba(111,211,166,.4);
--warn:#e8b26a;--warn-soft:rgba(232,178,106,.11);--warn-line:rgba(232,178,106,.45);
--bad:#ff5468;--bad-soft:rgba(226,59,78,.10);--bad-line:rgba(226,59,78,.30);
--info:#8fb4ec;--info-soft:rgba(143,180,236,.12);--info-line:rgba(143,180,236,.42);--info-fill:rgba(143,180,236,.5);
--r:8px;--r-sm:6px;--shell:1480px;--chart-human:#7aa2e3;--chart-auto:rgba(142,160,201,.26);
--font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--mono:ui-monospace,"Cascadia Mono",Consolas,"SFMono-Regular",monospace}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--accent-text);text-decoration-color:rgba(255,84,104,.4);text-underline-offset:2px}a:hover{text-decoration-color:currentColor}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
code{font:12px var(--mono);color:var(--muted);overflow-wrap:anywhere}
.envbar{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:6px 20px;background:var(--sunk);border-bottom:1px solid var(--line);color:var(--muted);font-size:12.5px}
.envbar b{font-size:10.5px;letter-spacing:.1em;color:var(--info);border:1px solid var(--info-line);background:var(--info-soft);border-radius:999px;padding:1px 9px;white-space:nowrap}
.topbar{position:sticky;top:0;z-index:20;background:var(--header);border-bottom:1px solid var(--line)}
.topbar-in{max-width:var(--shell);margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:0 28px;flex-wrap:wrap}
.brand{display:flex;align-items:baseline;gap:9px;padding:12px 0;color:var(--text);text-decoration:none;font-weight:800;font-size:17px;letter-spacing:-.02em;white-space:nowrap}
.brand i{font-style:normal;color:var(--accent-text)}
.brand small{font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);border-left:1px solid var(--line-2);padding-left:9px}
.nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;flex:1 1 auto;min-width:0}.nav::-webkit-scrollbar{display:none}
.nav a{color:var(--muted);text-decoration:none;padding:15px 12px 13px;font-weight:500;white-space:nowrap;border-bottom:2px solid transparent}
.nav a:hover{color:var(--accent-text);border-bottom-color:var(--line-2)}.nav a.on{color:var(--text);border-bottom-color:var(--accent);font-weight:650}
.nav-count{display:inline-block;min-width:20px;margin-left:6px;padding:1px 6px;border-radius:999px;background:var(--accent-strong);color:var(--on-accent);font-size:11.5px;font-weight:700;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;vertical-align:1px}.nav-count.neutral{background:var(--panel-2);color:var(--text);box-shadow:inset 0 0 0 1px var(--line-3)}
.who{color:var(--faint);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
main{padding:26px 20px 72px;max-width:var(--shell);margin:0 auto}
.page-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 18px;margin:0 0 18px}
.page-head .lede{grid-column:1/-1;margin:0;color:var(--muted);max-width:110ch}
h1{font-size:22px;line-height:1.25;margin:0;letter-spacing:-.015em;font-weight:700}
h2{font-size:15px;line-height:1.35;margin:0 0 10px;font-weight:650}
h3{font-size:11px;margin:0 0 8px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.1em}
.section{margin:30px 0 0}.section.minor{margin-top:36px;padding-top:22px;border-top:1px solid var(--line)}
.section-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 12px;margin:0 0 10px}.section-head h2{margin:0}.section-head p{margin:0}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
p{margin:0 0 10px}ul{margin:6px 0 10px;padding-left:18px}li{margin:3px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin:0 0 12px;min-width:0}
.card.quiet{background:var(--bg-2)}
.muted{color:var(--muted)}.faint{color:var(--faint)}.small{font-size:12.5px}.mono{font-family:var(--mono);font-size:12px}.nowrap{white-space:nowrap}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.flash{padding:10px 14px;border-radius:var(--r);margin:0 0 16px;border:1px solid var(--line-2);border-left-width:3px;background:var(--bg-2)}
.flash.ok{border-left-color:var(--ok)}.flash.err{border-color:var(--bad-line);border-left-color:var(--accent);background:var(--bad-soft)}
.notice{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;padding:10px 14px;border-radius:var(--r);border:1px solid var(--line);background:var(--bg-2);margin:0 0 12px}
.notice.warn{border-color:var(--warn-line);background:var(--warn-soft)}.notice .lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.grid{display:grid;gap:12px 14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
.cols-2{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.cols-4{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
label{display:block;font-size:12px;font-weight:500;color:var(--muted);margin:0 0 4px}
input,select,textarea{width:100%;background:var(--sunk);color:var(--text);border:1px solid var(--control-line);border-radius:var(--r-sm);padding:7px 10px;font:inherit;min-height:36px}
input::placeholder,textarea::placeholder{color:var(--faint);opacity:1}
input:hover,select:hover,textarea:hover{border-color:var(--accent-text)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--focus);box-shadow:0 0 0 3px var(--focus-soft)}
select{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 15px) 52%,calc(100% - 10px) 52%;background-size:5px 5px;background-repeat:no-repeat;padding-right:30px}
input[type=radio],input[type=checkbox]{width:16px;height:16px;min-height:0;accent-color:var(--focus);margin:0;flex:0 0 auto}
input[type=file]{padding:6px;min-height:0}
textarea{min-height:72px;line-height:1.5;resize:vertical}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;background:var(--accent-strong);color:var(--on-accent);border:1px solid var(--accent-strong);border-radius:var(--r-sm);padding:7px 14px;font:600 13.5px var(--font);cursor:pointer;text-decoration:none;white-space:nowrap}
button:hover,.btn:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
button:not(.secondary):not(.danger):not(:disabled):active,.btn:not(.secondary):not(.ghost):active{background:var(--accent-active);border-color:var(--accent-active)}
button.secondary,.btn.secondary{background:transparent;color:var(--text);border-color:var(--control-line)}
button.secondary:hover,.btn.secondary:hover{background:var(--panel-2);border-color:var(--accent-text)}
.btn.ghost{background:transparent;border-color:transparent;color:var(--muted);font-weight:500}.btn.ghost:hover{color:var(--text);background:var(--panel-2);border-color:transparent}
button.danger{background:transparent;color:var(--bad);border-color:var(--bad-line)}
button.danger:hover{background:var(--accent-strong);color:var(--on-accent);border-color:var(--accent-strong)}
button:disabled{opacity:.5;cursor:not-allowed}
.btn[aria-disabled=true]{opacity:.5;cursor:default}
.seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--control-line);border-radius:var(--r-sm);overflow:hidden;background:var(--sunk)}
.seg a{padding:6px 13px;color:var(--muted);text-decoration:none;font-weight:500;border-right:1px solid var(--line)}.seg a:last-child{border-right:0}
.seg a:hover{color:var(--text);background:var(--panel-2)}.seg a.on{background:var(--panel-2);color:var(--text);box-shadow:inset 0 -2px 0 var(--accent);font-weight:650}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;line-height:1.55;padding:0 8px;border-radius:999px;border:1px solid var(--line-2);color:var(--muted);margin:0 4px 4px 0;max-width:100%;overflow-wrap:anywhere}
.tag.flag,.tag.warn,.tag.geo-foreign_likely{border-color:var(--warn-line);color:var(--warn);background:var(--warn-soft)}
.tag.ok,.tag.geo-us_likely{border-color:var(--ok-line);color:var(--ok);background:var(--ok-soft)}
.tag.info{border-color:var(--info-line);color:var(--info);background:var(--info-soft)}
.tag.strong{color:var(--text);background:var(--panel-2);font-weight:600}
.stats{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:0 0 4px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:10px 14px;color:var(--muted);font-size:12.5px;line-height:1.35}
.stat b{display:block;font-size:22px;line-height:1.3;color:var(--text);font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.stat .muted{color:var(--faint)}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;white-space:nowrap}
th{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);background:var(--bg-2)}
tbody tr:hover td{background:rgba(142,160,201,.08)}tbody tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right}td.wrap{white-space:normal;min-width:220px;max-width:460px;overflow-wrap:anywhere}
td .clip{display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
td .sub{display:block;color:var(--faint);font-size:11.5px}
.table-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin:0 0 12px}
.table-card>b,.table-card>h2{display:block;padding:12px 14px 0}
.table-foot{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid var(--line);background:var(--bg-2)}
details summary{cursor:pointer;color:var(--muted)}details summary:hover{color:var(--text)}
details[open]>summary{margin-bottom:8px}
.kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 12px;font-size:12px;white-space:normal;min-width:0;max-width:520px}.kv dt{color:var(--faint)}.kv dd{margin:0;overflow-wrap:anywhere}
.actions{display:flex;gap:10px 14px;flex-wrap:wrap;align-items:center}
.actions label{display:inline-flex;gap:6px;align-items:center;color:var(--text);font-size:13px;margin:0}
.actions input:not([type=radio]):not([type=checkbox]),.actions select{width:auto}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.toolbar input{flex:1 1 240px;max-width:380px}
fieldset{border:1px solid var(--line);border-radius:var(--r);padding:10px 14px 14px;margin:0;min-width:0}
legend{padding:0 6px;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.filters{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.filters .grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));gap:10px}
.form-foot{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;margin-top:14px}
.bars{margin:0;padding:0;list-style:none}
.bar{display:flex;align-items:center;gap:10px;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--line);margin:0}.bar:last-child{border-bottom:0}
.bar .v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar .n{font-variant-numeric:tabular-nums;color:var(--muted);min-width:4ch;text-align:right}
.bar .track{flex:0 0 64px;height:5px;border-radius:3px;background:var(--sunk);overflow:hidden}.bar .fill{display:block;height:100%;background:var(--info-fill)}
.danger-zone{border-color:var(--bad-line);background:linear-gradient(var(--bad-soft),var(--bad-soft)),var(--panel)}
.danger-zone h2{color:var(--bad)}
.empty{padding:26px 16px;text-align:center;color:var(--muted)}
.story{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--line-2);border-radius:var(--r);padding:14px 16px;margin:0 0 10px}
.story.has-flags{border-left-color:var(--warn)}
.story-head{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 14px;align-items:start}
.rank{font:700 12px/1.9 var(--mono);color:var(--faint);min-width:3ch}
.story-title{font-size:15.5px;font-weight:650;line-height:1.4;margin:0 0 2px;overflow-wrap:anywhere}
.story-meta{font-size:12.5px;color:var(--faint);margin:0 0 8px}
.story-excerpt{font-size:13px;color:var(--muted);margin:0 0 8px;max-width:100ch}
.signals{display:flex;flex-wrap:wrap;align-items:baseline;margin:0 0 4px}
.signals .lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:0 8px 4px 0;min-width:62px}
.decide{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.choice{display:inline-flex;border:1px solid var(--control-line);border-radius:var(--r-sm);overflow:hidden;background:var(--sunk)}
.choice label{display:inline-flex;align-items:center;gap:7px;margin:0;padding:7px 13px;font-size:13px;font-weight:500;color:var(--text);cursor:pointer;border-right:1px solid var(--line)}.choice label:last-child{border-right:0}
.choice label:hover{background:var(--panel-2)}.choice label:has(input:checked){background:var(--panel-2);font-weight:650}
.choice label.a:has(input:checked){box-shadow:inset 0 -2px 0 var(--ok)}.choice label.r:has(input:checked){box-shadow:inset 0 -2px 0 var(--accent)}.choice label.s:has(input:checked){box-shadow:inset 0 -2px 0 var(--line-3)}
.choice label:has(input:focus-visible){outline:2px solid var(--focus);outline-offset:-2px}
.decide select,.decide input:not([type=radio]):not([type=checkbox]){width:auto;flex:0 1 auto;min-width:0;max-width:100%}
.opts{display:flex;flex-wrap:wrap;gap:6px 16px}.opts label{display:inline-flex;gap:6px;align-items:center;margin:0;color:var(--muted);font-size:12.5px}
.editor{margin-top:8px;padding:0 0 0 calc(3ch + 14px)}.editor[open]{padding:12px 14px;border:1px solid var(--line);border-radius:var(--r);background:var(--bg-2)}
.editor>summary{font-weight:500;font-size:13px}
.review-tools{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin:12px 0}.review-tools[hidden]{display:none}.review-tools button.is-selected{border-color:var(--ok);color:var(--ok);background:var(--ok-soft)}.review-selected{font-size:13px;font-weight:650;color:var(--ok)}
.review-counts{font-size:13px;color:var(--text);font-variant-numeric:tabular-nums;margin-left:auto}
.story[data-choice=approve]{border-left-color:var(--ok)}.story[data-choice=reject]{border-left-color:var(--accent)}
#review-preview{max-width:min(720px,calc(100vw - 32px));width:100%;background:var(--panel);color:var(--text);border:1px solid var(--line-2);border-radius:var(--r);padding:18px 20px}#review-preview::backdrop{background:rgba(5,9,18,.7)}#review-preview h3{margin:14px 0 6px;font-size:14px}#review-preview ul{margin:0;padding-left:18px;max-height:40vh;overflow:auto}.dialog-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:16px}.decide select{max-width:260px}
.sticky-submit{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;padding:12px 16px;margin:16px 0 0;background:var(--bg-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 -8px 24px rgba(11,17,32,.45)}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12.5px;color:var(--muted);margin:0 0 14px;align-items:center}
.status{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;white-space:nowrap}.status::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.pager{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.pager a,.pager span{min-width:36px;text-align:center;padding:5px 10px;border:1px solid var(--line-2);border-radius:var(--r-sm);text-decoration:none;color:var(--muted);font-size:13px}
/* Analytics: a compact summary band (metrics + daily chart), the filter bar,
   then the event table as the main surface, breakdowns and data operations. */
.analytics-workspace .page-head{margin-bottom:12px}.analytics-workspace .page-head .lede{font-size:12.5px;color:var(--faint)}
.analytics-workspace :is(a,summary,h2){scroll-margin-top:130px}
.analytics-workspace .notice{margin-bottom:10px;padding:7px 12px;font-size:13px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:12px 16px;min-width:0}
.panel-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;margin:0 0 6px}.panel-head h3{margin:0;flex:1 1 auto}
.overview{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
@media (min-width:1100px){.overview{grid-template-columns:minmax(400px,5fr) minmax(0,7fr)}}
.kpi-panel .eyebrow{margin:0 0 6px}
.kpi-main{display:flex;align-items:center;gap:18px}
.kpi-main .stat{background:none;border:0;padding:0;font-size:12.5px;white-space:nowrap}.kpi-main .stat b{font-size:30px;line-height:1.1;letter-spacing:-.02em}
.kpi-split{flex:1;min-width:0}
.split{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--sunk)}.split span{display:block;height:100%}
.split .human,.key.human::before{background:var(--chart-human)}.split .automated,.key.automated::before{background:var(--chart-auto)}
.key{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);white-space:nowrap}.key::before{content:"";width:9px;height:9px;border-radius:2px}
.keys{display:flex;flex-wrap:wrap;gap:2px 12px;margin-top:6px}.panel-head .keys{margin:0}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.5fr);gap:8px 14px;margin:12px 0 0;padding:10px 0 0;border-top:1px solid var(--line)}
.kpis .stat{background:none;border:0;padding:0;font-size:12px}.kpis .stat b{font-size:17px}
.chart-panel{display:flex;flex-direction:column}
.chart-note{margin:0 0 2px}
.chart-window{display:inline-flex;border:1px solid var(--line-2);border-radius:var(--r-sm);overflow:hidden}
.chart-window input{position:absolute;opacity:0;width:1px;height:1px}
.chart-window label{margin:0;padding:2px 10px;font-size:11.5px;font-weight:600;color:var(--muted);cursor:pointer;border-right:1px solid var(--line)}.chart-window label:last-child{border-right:0}
.chart-window input:checked+label{background:var(--panel-2);color:var(--text);box-shadow:inset 0 -2px 0 var(--accent)}
.chart-window input:focus-visible+label{outline:2px solid var(--focus);outline-offset:-2px}
.chart{position:relative;flex:1;min-height:118px;padding:14px 0 0;overflow-x:auto;overscroll-behavior-x:contain}
.chart .cols{display:flex;gap:3px;height:100%;width:max-content;min-width:100%}.chart.dense .cols{gap:1px}
.chart .col{flex:1 0 4px;display:flex;flex-direction:column;position:relative;z-index:1}
.chart .plot{flex:1;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid var(--line-2)}
.chart .day-bar{width:min(100%,26px);height:var(--h-all);display:flex;flex-direction:column;justify-content:flex-end;background:var(--chart-auto);border-radius:2px 2px 0 0;overflow:hidden}
.chart .day-bar i{display:block;background:var(--chart-human)}
.chart .col:hover .day-bar{filter:brightness(1.3)}
.chart .x{width:0;align-self:center;height:18px;padding-top:4px;font-size:10.5px;line-height:1;color:var(--faint);white-space:nowrap;display:flex;justify-content:center}
.chart .peak{position:absolute;left:0;right:0;top:14px;border-top:1px dashed var(--line-2);pointer-events:none}.chart .peak span{position:absolute;left:0;bottom:2px;font-size:10px;line-height:1;color:var(--faint)}
.chart :is(.x-30,.x-7,.peak-30,.peak-7),.chart-note :is(.note-30,.note-7){display:none}
.chart .in-all:first-child .x,.chart-panel:has(#cw-30:checked) .in-30:not(.in-30~.in-30) .x,.chart-panel:has(#cw-7:checked) .in-7:not(.in-7~.in-7) .x{align-self:flex-start;justify-content:flex-start}
.chart .col:last-child .x{align-self:flex-end;justify-content:flex-end}
.chart-panel:has(#cw-30:checked) .col:not(.in-30),.chart-panel:has(#cw-7:checked) .col:not(.in-7){display:none}
.chart-panel:has(#cw-30:checked) .day-bar{height:var(--h-30)}.chart-panel:has(#cw-7:checked) .day-bar{height:var(--h-7)}
.chart-panel:has(#cw-30:checked) :is(.x-all,.peak-all,.note-all),.chart-panel:has(#cw-7:checked) :is(.x-all,.peak-all,.note-all){display:none}
.chart-panel:has(#cw-30:checked) :is(.x-30,.peak-30,.note-30),.chart-panel:has(#cw-7:checked) :is(.x-7,.peak-7,.note-7){display:inline}
.chart-empty{flex:1;display:grid;place-items:center;min-height:118px;color:var(--muted);font-size:13px;border:1px dashed var(--line);border-radius:var(--r-sm)}
.filterbar{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:10px 14px}
.filterbar .panel-head{margin-bottom:6px}
.filterbar label{font-size:11px;margin-bottom:2px}.filterbar input,.filterbar select{min-height:32px;padding-top:5px;padding-bottom:5px;font-size:13px}
.filter-row{display:grid;gap:8px 10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));align-items:end}
.filter-apply{display:flex;gap:6px;align-items:center}.filter-apply button,.filter-apply .btn{min-height:32px;padding:4px 12px}
.filter-more{margin-top:8px}.filter-more>summary{display:inline-block;font-size:12.5px;font-weight:600;padding:2px 0;list-style:none}.filter-more>summary::-webkit-details-marker{display:none}.filter-more>summary::before{content:"▸";display:inline-block;width:1.1em;color:var(--faint)}.filter-more[open]>summary::before{content:"▾"}
.filter-more>summary .n{color:var(--accent-text);font-weight:600}.filter-more[open]>summary{margin-bottom:8px}
.filter-foot{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}
.filter-foot .actions{gap:6px 8px}.filter-foot .btn{min-height:28px;padding:3px 10px;font-size:12.5px}
.analytics-workspace .section{margin-top:18px}.analytics-workspace .section.minor{margin-top:28px}
.stream-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;margin:0 0 8px}.stream-head h2{margin:0}.stream-head p{margin:0}
#analytics-pager{min-width:0;max-width:100%}#analytics-page{max-width:100%}
.ip-link{color:var(--info);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;font-weight:600}.ip-link:hover{color:var(--text)}
/* Event table: one compact row per event in distinct columns. Column widths
   come from the column list (analytics-event.mjs) as --cols-xl/-lg/-md. */
.events-table{display:block;width:100%;font-size:12.5px}
.events-table>:is(thead,tbody){display:block}
.events-table tr{display:grid;grid-template-columns:var(--cols-xl);column-gap:8px;padding:0 12px;border-bottom:1px solid var(--line);align-items:center}
.events-table tbody tr:nth-child(even){background:rgba(142,160,201,.025)}
.events-table tbody tr:last-child{border-bottom:0}
.events-table :is(th,td){display:block;padding:6px 0;border:0;min-width:0;background:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.events-table thead tr{background:var(--bg-2)}.events-table th{font-size:10px;letter-spacing:.05em;padding:8px 0}
.events-table th[title]{cursor:help;text-decoration:underline dotted var(--line-3);text-underline-offset:3px}
.events-table tbody tr:hover{background:rgba(142,160,201,.07)}.events-table tbody tr:hover td{background:none}
.events-table td>span,.events-table td>a,.events-table td>time{overflow:hidden;text-overflow:ellipsis}
.events-table time{font-variant-numeric:tabular-nums}
.events-table .c-all{color:var(--text);font-weight:600}.events-table .of{color:var(--faint);font-size:11px;margin-left:1px}
.events-table td.c-page{color:var(--text)}
.events-table td.wrap{white-space:normal;overflow-wrap:anywhere;text-overflow:clip}
.events-table td.wrap>span{overflow:visible}.events-table .cc{font-weight:700;color:var(--text);margin-right:2px}.events-table .two{display:flex;flex-direction:column;min-width:0}.events-table .two>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.events-table .two .sub{color:var(--faint);font-size:11px;line-height:1.3}.events-table .c-time{color:var(--text)}
.events-table td.empty{grid-column:1/-1;white-space:normal}
.src,.actor{font-size:11.5px;font-weight:600}.src.native{color:var(--muted)}.src.legacy{color:var(--warn)}
.actor::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;background:currentColor;vertical-align:1px}.actor.human{color:var(--info)}.actor.auto{color:var(--muted)}
.events-table td.more{overflow:visible;white-space:normal;text-align:right}
.events-table tbody tr:has(details[open]){background:var(--bg-2)}
.events-table tr:has(details[open])>td.more{grid-column:1/-1;padding-top:0;text-align:left}
.event-details>summary{display:block;width:max-content;margin-left:auto;list-style:none;font-size:11.5px;font-weight:600;color:var(--info);padding:0 8px;border:1px solid var(--info-line);border-radius:999px;white-space:nowrap}
.event-details>summary::-webkit-details-marker{display:none}.event-details>summary:hover{color:var(--text);background:var(--info-soft)}
.event-details[open]>summary{color:var(--text);background:var(--info-soft)}
.event-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:6px 20px;margin:6px 0 4px;padding:10px 14px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunk);font-size:12px}
.event-fields>div{min-width:0}.event-fields dt{color:var(--faint);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}.event-fields dd{margin:0;overflow-wrap:anywhere;color:var(--text)}
.ip-address{font-size:17px;font-weight:600;color:var(--text);margin:0 0 10px;overflow-wrap:anywhere}.activity-overview .kv{max-width:none}.activity-kpis{grid-template-columns:repeat(2,minmax(0,1fr));margin:0;padding:0;border:0}.activity-exports{gap:6px 8px}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
/* Narrower desktops drop the columns marked lg, then md (their values stay in Details). */
@media (max-width:1415px){.events-table tr{grid-template-columns:var(--cols-lg)}.events-table .hide-lg{display:none}}
@media (max-width:1275px){.events-table tr{grid-template-columns:var(--cols-md)}.events-table .hide-md{display:none}}
/* Below that, each event becomes a labelled card with every column. */
@media (max-width:1099px){
  .events-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
  .events-table tr{grid-template-columns:repeat(4,minmax(0,1fr));gap:0 14px;padding:10px 14px;align-items:start}
  .events-table :is(.hide-lg,.hide-md){display:block}
  .events-table td{padding:5px 0;white-space:normal;overflow-wrap:anywhere}.events-table td.num{text-align:left}
  .events-table td::before{content:attr(data-label);display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--faint);margin-bottom:1px;letter-spacing:.04em}
  .events-table td.wide{grid-column:span 2}.events-table td:is(.more,.empty){grid-column:1/-1;text-align:left}.events-table td:is(.more,.empty)::before{display:none}
  .event-details>summary{margin-left:0}
  .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
  .table-foot .actions{min-width:0;max-width:100%}.table-foot form select{max-width:100%}
}
@media (max-width:760px){.events-table tr{grid-template-columns:repeat(2,minmax(0,1fr))}.events-table td.wide{grid-column:1/-1}.kpi-main{flex-wrap:wrap}.kpi-split{flex-basis:100%}}
@media (max-width:360px){.events-table tr{grid-template-columns:minmax(0,1fr)}}
@media (max-width:520px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.activity-overview .kv{grid-template-columns:minmax(0,1fr);gap:3px}.activity-overview .kv dd{margin-bottom:8px}}
.pager a:hover{color:var(--text);background:var(--panel-2)}.pager .on{color:var(--text);background:var(--panel-2);box-shadow:inset 0 -2px 0 var(--accent);font-weight:650}.pager .gap{border-color:transparent}
@media (max-width:760px){main{padding:18px 14px 60px}.page-head{grid-template-columns:minmax(0,1fr)}.page-head .seg{justify-self:start}.topbar-in{padding:0 14px;gap:0 16px}.who{display:none}.envbar{padding:6px 14px}h1{font-size:20px}.card{padding:14px}.stat b{font-size:19px}.toolbar input{max-width:none}.nav{flex-basis:100%;margin:0 -6px;order:3}.nav a{padding:10px 10px 9px}.sticky-submit{position:static;box-shadow:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

export function page({ title, active, identity, body, flash, lede = '', headActions = '', wide = false }) {
  // The Weekly review link carries a marker that index.mjs replaces with the
  // live pending count (or removes when GitHub cannot be read).
  const nav = NAV.map(([href, label]) => `<a href="${href}"${active === href ? ' class="on" aria-current="page"' : ''}>${h(label)}${href === '/review' ? PENDING_MARKER : href === '/published' ? PUBLISHED_MARKER : ''}</a>`).join('');
  const flashHtml = flash ? `<div class="flash ${flash.type === 'err' ? 'err' : 'ok'}" role="${flash.type === 'err' ? 'alert' : 'status'}">${h(flash.message)}</div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0b1120"><title>${h(title)} · AmericaWhat Boss</title><style>${CSS}</style></head>
<body><header class="topbar"><div class="topbar-in"><a class="brand" href="/review"><span>america<i>what</i></span><small>Boss</small></a><nav class="nav" aria-label="Boss sections">${nav}</nav><span class="who">${h(identity?.email || '')}</span></div></header>
<main${wide ? ' class="analytics-workspace"' : ''}>${flashHtml}<div class="page-head"><h1>${h(title)}</h1>${headActions}${lede ? `<p class="lede">${lede}</p>` : ''}</div>${body}</main></body></html>`;
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
