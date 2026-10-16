// Shared Boss design system. No external assets or runtime styling dependency.
// One scale for a daily editorial tool: 14px reading text, 36px controls,
// 15-16px only where the owner edits published words (headline, comment).
export const CSS = `
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
--r:10px;--r-sm:6px;--chart-human:#7aa2e3;--chart-auto:rgba(142,160,201,.26);
--sidebar:232px;--control:36px;--mobile-head:56px;
--font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--mono:ui-monospace,"Cascadia Mono",Consolas,"SFMono-Regular",monospace}

/* Foundations */
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 var(--font);-webkit-font-smoothing:antialiased}
[hidden]{display:none!important}
a{color:var(--info);text-decoration-color:var(--info-line);text-underline-offset:3px}
a:hover{color:var(--text);text-decoration-color:currentColor}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
code,.mono{font:12.5px/1.5 var(--mono);overflow-wrap:anywhere}
code{color:var(--muted)}
kbd{display:inline-block;min-width:18px;padding:0 5px;font:600 11px/17px var(--mono);text-align:center;color:var(--text);background:var(--bg);border:1px solid var(--line-2);border-bottom-width:2px;border-radius:4px}
h1,h2,h3,p{margin:0}
h1{font-size:24px;line-height:1.25;letter-spacing:-.025em;font-weight:700}
h2{font-size:16px;line-height:1.4;font-weight:650;letter-spacing:-.01em}
h3{font-size:14px;line-height:1.45;font-weight:650}
p+p{margin-top:8px}
ul{margin:8px 0;padding-left:20px}
li{margin:3px 0}
.muted,.faint{color:var(--muted)}
.small{font-size:13px}
.nowrap{white-space:nowrap}
.ok{color:var(--ok)}
.warn{color:var(--warn)}
.bad{color:var(--bad)}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.eyebrow{font-size:11.5px;font-weight:650;color:var(--muted);letter-spacing:.07em;text-transform:uppercase}

.section{margin-top:28px}
.section.minor{margin-top:36px;padding-top:24px;border-top:1px solid var(--line)}
.section-head,.panel-head,.stream-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 20px;margin-bottom:12px}
.section-head p,.stream-head p{color:var(--muted)}

.card,.panel,.table-card{min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:var(--r)}
.card,.panel{padding:20px}
.card{margin-bottom:16px}
.card h2,.card h3{margin-bottom:10px}
.card.quiet{background:var(--bg-2)}

.flash,.notice{padding:10px 14px;border-radius:8px;margin-bottom:16px;background:var(--bg-2);border:1px solid var(--line);color:var(--muted);font-size:13.5px}
.flash{border-left:3px solid var(--ok);color:var(--text)}
.flash.err{border-color:var(--bad-line);border-left-color:var(--bad);color:var(--bad);background:var(--bad-soft)}
.notice{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px}
.notice.warn{border-color:var(--warn-line);background:var(--warn-soft);color:var(--warn)}
.notice .lbl{font-weight:700}
.empty{padding:36px 20px;text-align:center;color:var(--muted)}

/* Shell: fixed sidebar, content centred in the remaining width. */
.skip-link{position:fixed;left:calc(var(--sidebar) + 16px);top:-80px;z-index:50;background:var(--panel);padding:10px}
.skip-link:focus{top:8px}
.sidebar{position:fixed;inset:0 auto 0 0;width:232px;z-index:30;background:var(--bg-2);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:22px 12px 16px;overflow-y:auto}
.brand{display:flex;align-items:baseline;gap:7px;color:var(--text);text-decoration:none;font-weight:800;font-size:19px;letter-spacing:-.035em;white-space:nowrap}
.brand i{font-style:normal;color:var(--accent-text)}
.brand small{font-size:10px;font-weight:700;letter-spacing:.14em;color:var(--muted);text-transform:uppercase}
.sidebar .brand{padding:0 10px 22px}
.nav{display:grid;gap:2px}
.nav-group{display:block;padding:14px 12px 5px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.nav-group:first-child{padding-top:0}
.nav a{display:flex;align-items:center;gap:10px;min-height:38px;padding:7px 10px;color:var(--muted);border-radius:7px;text-decoration:none;font-weight:550;font-size:14px;position:relative}
.nav a:hover{background:var(--panel);color:var(--text)}
.nav a.on{background:var(--panel);color:var(--text);font-weight:650;box-shadow:inset 0 0 0 1px var(--line)}
.nav a.on::before{content:"";position:absolute;left:-12px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
.nav-icon{width:17px;height:17px;flex:none;opacity:.85}
.nav-count{margin-left:auto;padding:0 7px;min-width:26px;line-height:20px;text-align:center;border-radius:10px;background:var(--accent-strong);color:var(--on-accent);font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}
.nav-count.neutral{background:var(--line-2);color:var(--text)}
.sidebar-footer{margin-top:auto;padding-top:24px}
.quick-links{border-top:1px solid var(--line);padding:14px 2px 10px;display:grid;gap:1px}
.quick-links h2{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:0 10px 6px}
.quick-links a{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-radius:6px;font-size:13px;color:var(--muted);text-decoration:none}
.quick-links a span{opacity:.6;font-size:12px}
.quick-links a:hover{color:var(--text);background:var(--panel)}
.who{display:block;font-size:12px;border-top:1px solid var(--line);padding:12px 12px 0;color:var(--muted);overflow-wrap:anywhere}

.workspace{margin-left:var(--sidebar);min-width:0}
main{width:100%;max-width:1360px;margin:0 auto;padding:28px clamp(20px,2.4vw,40px) 48px;min-width:0}
main.analytics-workspace,main.review-workspace{max-width:1680px}
main.form-workspace,main.health-workspace{max-width:1080px}
.envbar{margin-left:var(--sidebar);display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:6px 24px;background:var(--sunk);border-bottom:1px solid var(--line);color:var(--muted);font-size:12px}
.envbar b{font-size:11px;letter-spacing:.08em;color:var(--info)}
.page-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 20px;margin-bottom:20px}
.page-head .lede{grid-column:1;color:var(--muted);font-size:13.5px;max-width:110ch;line-height:1.55}
.page-head>:not(h1):not(.lede){grid-row:1/span 2;grid-column:2}
.mobile-nav,.drawer-close,.drawer-shade,.nav-toggle{display:none}

/* Forms and actions */
label{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:5px}
input,select,textarea{width:100%;min-width:0;min-height:var(--control);border:1px solid var(--control-line);border-radius:7px;background:var(--sunk);color:var(--text);padding:7px 11px;font:inherit;font-size:14px}
input::placeholder,textarea::placeholder{color:var(--muted);opacity:1}
input:hover,select:hover,textarea:hover{border-color:var(--info)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--focus);box-shadow:0 0 0 3px var(--focus-soft)}
select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 16px) 52%,calc(100% - 11px) 52%;background-size:5px 5px;background-repeat:no-repeat;padding-right:30px}
textarea{min-height:96px;resize:vertical;line-height:1.6}
input[type=radio],input[type=checkbox]{width:16px;height:16px;min-height:0;accent-color:var(--focus);margin:0;flex:none}
input[type=file]{padding:6px}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:var(--control);padding:6px 14px;border:1px solid var(--accent-strong);border-radius:7px;background:var(--accent-strong);color:var(--on-accent);font:600 13.5px/1.4 var(--font);text-decoration:none;white-space:nowrap;cursor:pointer}
button:hover,.btn:hover{background:var(--accent-hover);border-color:var(--accent-hover);color:var(--on-accent)}
button:active,.btn:active{background:var(--accent-active)}
button.secondary,.btn.secondary{background:transparent;border-color:var(--control-line);color:var(--text)}
button.secondary:hover,.btn.secondary:hover{background:var(--info-soft);border-color:var(--info)}
.btn.ghost{background:transparent;border-color:transparent;color:var(--muted);font-weight:550}
.btn.ghost:hover{background:var(--info-soft);color:var(--text)}
button.danger{background:transparent;color:var(--bad);border-color:var(--bad-line)}
button.danger:hover{background:var(--accent-strong);color:var(--on-accent);border-color:var(--accent-strong)}
button:disabled{opacity:.5;cursor:not-allowed}
.btn[aria-disabled=true]{opacity:.5;cursor:default}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px 16px}
.cols-2,.cols-4{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))}
.cols-4{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
.cols-4 .card,.cols-2 .card{margin:0}
.actions,.opts{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.actions label,.opts label{display:inline-flex;gap:8px;align-items:center;margin:0;color:var(--muted);font-size:13px;font-weight:500}
.actions input:not([type=radio]):not([type=checkbox]),.actions select{width:auto;max-width:100%}
.opts{align-items:flex-start}
.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.toolbar input{flex:1 1 280px;max-width:520px}
.toolbar select{width:auto;max-width:100%;min-width:160px}
.toolbar label{margin:0 0 0 6px}
.toolbar .sort-select{min-width:120px}
.form-foot{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding-top:16px;margin-top:18px;border-top:1px solid var(--line)}
fieldset{padding:16px;border:1px solid var(--line);border-radius:8px;min-width:0;margin:0}
legend{font-size:13px;color:var(--muted);padding:0 6px}
.filters{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.tag{display:inline-flex;align-items:center;gap:4px;padding:0 7px;border-radius:5px;font-size:11.5px;font-weight:600;line-height:20px;color:var(--muted);background:var(--bg-2);border:1px solid var(--line);max-width:100%;overflow-wrap:anywhere}
.tag.ok,.tag.geo-us_likely{color:var(--ok);background:var(--ok-soft);border-color:var(--ok-line)}
.tag.warn,.tag.flag,.tag.geo-foreign_likely{color:var(--warn);background:var(--warn-soft);border-color:var(--warn-line)}
.tag.info{color:var(--info);background:var(--info-soft);border-color:var(--info-line)}
.tag.strong{color:var(--text)}

/* Metric strips: one surface, divided cells. */
.stat{font-size:12.5px;color:var(--muted);line-height:1.4}
.stat b{display:block;font-size:22px;line-height:1.25;letter-spacing:-.02em;color:var(--text);font-variant-numeric:tabular-nums;margin-bottom:2px}
.stat b.warn{color:var(--warn)}
.stat b.bad{color:var(--bad)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.stats>.stat{padding:14px 18px;border-right:1px solid var(--line)}
.stats>.stat:last-child{border-right:0}
.reaction-stats .stat:first-child b{color:var(--accent-text)}

.published-editor{container-type:inline-size}
.published-editor .editor-fields{margin-top:0}
.seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--line-2);border-radius:7px;overflow:hidden}
.seg a{padding:6px 13px;text-decoration:none;color:var(--muted);font-size:13px}
.seg a+a{border-left:1px solid var(--line)}
.seg a.on{background:var(--info-soft);color:var(--text);font-weight:600}
.seg a:hover{background:var(--panel)}

/* Tables: data keeps its size, only the table viewport scrolls. */
.table-card{overflow:hidden;margin-bottom:16px}
.scroll,.event-scroll{overflow-x:auto;overscroll-behavior-x:contain;max-width:100%;scrollbar-color:var(--muted) var(--bg-2)}
.event-scroll{position:relative;max-height:75dvh;overflow:auto;container-type:inline-size}
.scroll:focus-visible,.event-scroll:focus-visible{outline-offset:-3px}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
th,td{padding:10px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle;white-space:nowrap}
th{background:var(--bg-2);font-size:11px;font-weight:650;letter-spacing:.05em;color:var(--muted);text-transform:uppercase}
tbody tr:hover td{background:rgba(142,160,201,.045)}
tbody tr:last-child td{border-bottom:0}
td.wrap{white-space:normal;min-width:260px;overflow-wrap:anywhere;line-height:1.5}
td.num,th.num{text-align:right}
td .sub{display:block;color:var(--muted);font-size:12px;margin-top:3px}
td .clip{display:block;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.table-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;background:var(--bg-2);border-top:1px solid var(--line)}
.table-foot .btn{min-height:32px;padding:4px 11px}
.table-foot select{min-height:32px;padding-top:4px;padding-bottom:4px}
.table-card>h2{padding:16px 16px 0}

.published-table .headline{font-weight:600;color:var(--text);text-decoration:none}
.published-table .headline:hover{text-decoration:underline;text-decoration-color:var(--info)}
.published-table td.wrap{width:58%;min-width:320px}
.published-table .live-path{font-size:11.5px;margin-top:2px}
.published-table .live-path .clip{max-width:min(100%,520px);color:var(--muted);text-decoration-color:var(--line-2)}
.published-table .live-path .clip:hover{color:var(--info)}
.published-table .id-cell{color:var(--muted);font-size:12px}
.published-table td:last-child{text-align:right}
.published-table td:last-child .btn{min-height:30px;padding:3px 12px;font-size:13px}

.reactions-table td.wrap{width:55%;min-width:300px;font-weight:550}
.reactions-table td.wrap a{color:var(--text);text-decoration:none}
.reactions-table td.wrap a:hover{text-decoration:underline}
.reactions-table td.num{min-width:72px}
.reactions-table th a{display:block;color:inherit;text-decoration:none}
.reactions-table th a:hover{color:var(--text)}
.reactions-table th[aria-sort] a{color:var(--text)}
.reactions-table td:last-child{color:var(--text);background:var(--info-soft)}

.pager{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.pager a,.pager span{min-width:32px;padding:4px 9px;text-align:center;border:1px solid var(--line-2);border-radius:6px;text-decoration:none;color:var(--muted);font-size:13px}
.pager a:hover{background:var(--panel);color:var(--text)}
.pager .on{background:var(--info-soft);border-color:var(--info);color:var(--text)}
.pager .gap{border-color:transparent}

details summary{cursor:pointer;color:var(--info);font-size:13px}
details[open]>summary{margin-bottom:10px}
.kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 20px;min-width:0;font-size:13.5px;white-space:normal}
.kv dt{color:var(--muted)}
.kv dd{margin:0;overflow-wrap:anywhere}
.danger-zone{border-color:var(--bad-line)}
.danger-zone h2{color:var(--bad)}
.status{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.health-workspace td.wrap{width:60%}
.bars{list-style:none;margin:0;padding:0}
.bar{display:flex;align-items:center;gap:12px;padding:6px 0;margin:0;border-bottom:1px solid var(--line);font-size:13px}
.bar:last-child{border:0}
.bar .v{flex:1;min-width:0;overflow-wrap:anywhere}
.bar .n{font-variant-numeric:tabular-nums;color:var(--muted);min-width:4ch;text-align:right}
.bar .track{width:64px;height:5px;border-radius:4px;background:var(--sunk);flex:none;overflow:hidden}
.bar .fill{display:block;height:100%;background:var(--info-fill)}

/* Weekly review: a batch bar over a two-pane desk that fits the viewport.
   The queue and the story editor scroll independently; one story at a time. */
.review-workspace .page-head{margin-bottom:14px}
.review-top{display:flex;align-items:center;justify-content:space-between;gap:10px 24px;margin-bottom:14px;padding:10px 10px 10px 18px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r)}
.review-overview{display:grid;gap:2px;min-width:0}
.review-summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 18px;color:var(--muted);font-size:13px}
.review-summary b{font-size:17px;color:var(--text);margin-right:2px;font-variant-numeric:tabular-nums}
.review-summary .summary-risk{color:var(--warn)}
.review-summary .summary-risk b{font-size:13px;color:var(--warn)}
#review-scope{font-size:12.5px}
.review-apply-bar{display:flex;align-items:center;gap:16px}
.apply-status{text-align:right}
.apply-status p{font-size:11.5px;white-space:nowrap}
.review-counts{font-size:13px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.review-counts .has{color:var(--text)}
.review-counts .count-approve.has{color:var(--ok)}
.review-counts .count-reject.has{color:var(--bad)}
.review-apply-bar button{min-width:150px}

.review-workbench.is-enhanced{display:grid;grid-template-columns:clamp(270px,24vw,360px) minmax(0,1fr);gap:14px;height:calc(100dvh - var(--workbench-top,220px) - 14px);min-height:560px}
.review-queue{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--line);border-radius:var(--r);background:var(--panel);overflow:hidden}
.review-tools{padding:12px;display:grid;gap:8px;border-bottom:1px solid var(--line);background:var(--bg-2)}
.queue-heading{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.queue-heading h2{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.queue-find{display:grid;grid-template-columns:minmax(0,1fr) 124px;gap:6px}
.queue-find input,.queue-find select{min-height:34px;font-size:13px}
.queue-bulk{display:flex;gap:6px;flex-wrap:wrap}
.queue-bulk button{min-height:30px;padding:3px 10px;font-size:12.5px;white-space:normal}
.review-tools button.is-selected{color:var(--ok);background:var(--ok-soft);border-color:var(--ok)}
.review-selected{font-size:12.5px;font-weight:600;color:var(--ok)}
.review-selected:empty{display:none}

.story-queue-list{list-style:none;margin:0;padding:0;overflow-y:auto;overscroll-behavior:contain;min-height:0;flex:1;scrollbar-color:var(--line-3) transparent}
.queue-item{margin:0}
.story-picker{width:100%;min-height:0;display:grid;grid-template-columns:26px minmax(0,1fr);gap:10px;align-items:start;padding:10px 12px 10px 9px;border:0;border-left:3px solid transparent;border-bottom:1px solid var(--line);border-radius:0;background:transparent;text-align:left;white-space:normal;color:var(--text);font-weight:500;position:relative}
.story-picker:hover{background:var(--bg-2);border-color:var(--line);border-left-color:var(--line-3);color:var(--text)}
.story-picker[aria-pressed=true]{background:var(--info-soft);border-left-color:var(--info)}
.story-picker:focus-visible{outline-offset:-2px;border-radius:0}
.queue-rank{display:grid;place-items:center;height:22px;margin-top:1px;border-radius:5px;font-size:11px;font-weight:700;color:var(--muted);background:var(--bg-2);border:1px solid var(--line-2);font-variant-numeric:tabular-nums}
.story-picker[data-choice=approve] .queue-rank{color:var(--bg);background:var(--ok);border-color:var(--ok)}
.story-picker[data-choice=reject] .queue-rank{color:var(--on-accent);background:var(--accent-strong);border-color:var(--accent-strong)}
.queue-copy{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 8px;min-width:0}
.queue-title{flex-basis:100%;font-size:13.5px;line-height:1.4;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.queue-source{flex:none;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.queue-status{display:flex;flex:1;gap:0 8px;font-size:12px;color:var(--muted);min-width:0;white-space:nowrap;overflow:hidden}
.queue-status>span:empty{display:none}
.queue-status .ok{color:var(--ok)}
.queue-decision{position:absolute;top:10px;right:10px;font-size:11px;font-weight:700;padding:0 6px;border-radius:4px;line-height:18px}
.queue-decision:empty{display:none}
.story-picker[data-choice=approve] .queue-decision{color:var(--ok);background:var(--ok-soft)}
.story-picker[data-choice=reject] .queue-decision{color:var(--bad);background:var(--bad-soft)}
.story-picker:has(.queue-decision:not(:empty)) .queue-title{padding-right:72px}

.review-detail{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--line);border-radius:var(--r);background:var(--panel);overflow:hidden;container-type:inline-size}
.detail-navigation{display:flex;align-items:center;gap:10px 14px;padding:7px 10px 7px 20px;border-bottom:1px solid var(--line);background:var(--bg-2)}
#review-position{font-size:13px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.key-hint{margin-left:auto;font-size:12px;color:var(--muted);white-space:nowrap}
.detail-paging{display:flex;gap:6px}
.detail-paging button{min-height:30px;padding:3px 11px;font-size:13px}
.back-to-stories{display:none}
.filter-notice{padding:7px 20px;color:var(--warn);background:var(--warn-soft);border-bottom:1px solid var(--warn-line)}
.review-editor-scroll{min-width:0;min-height:0}
.is-enhanced .review-editor-scroll{flex:1;overflow-y:auto;overscroll-behavior:contain}

.story{padding:18px 22px 22px;margin:0;background:var(--panel)}
.story+.story{border-top:1px solid var(--line-2)}
.story-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px 24px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.story-heading{min-width:0;flex:1 1 320px}
.story-title{font-size:18px;line-height:1.35;overflow-wrap:anywhere;margin-bottom:6px}
.is-enhanced .story-title{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.story-meta{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.story-meta b{color:var(--text);font-weight:600}
.story-number{display:inline-block;margin-right:8px;padding:0 6px;border-radius:4px;background:var(--bg-2);border:1px solid var(--line-2);font-size:11px;font-weight:700;line-height:18px;color:var(--text);font-variant-numeric:tabular-nums}
.story-status{display:flex;gap:6px 8px;align-items:center;flex-wrap:wrap;margin-top:8px}
.read-source{font-size:13px;margin-left:4px}
.draft-preview{display:none}
.decision-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

.decide{flex:none}
.choice{display:flex;border:1px solid var(--control-line);border-radius:8px;overflow:hidden;background:var(--sunk)}
.choice label{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;min-width:92px;padding:0 13px;margin:0;font-size:14px;font-weight:600;color:var(--text);cursor:pointer;border-right:1px solid var(--line-2)}
.choice label:last-child{border-right:0}
.choice input{position:absolute;opacity:0;width:1px;height:1px}
.choice label::before{font-size:13px;line-height:1;color:var(--muted)}
.choice .a::before{content:"✓"}
.choice .r::before{content:"✕"}
.choice .s::before{content:"–"}
.choice kbd{color:var(--muted);background:transparent}
.choice label:hover{background:var(--info-soft)}
.choice .a:has(input:checked){color:var(--bg);background:var(--ok)}
.choice .r:has(input:checked){color:var(--on-accent);background:var(--accent-strong)}
.choice .s:has(input:checked){color:var(--text);background:var(--line-2)}
.choice label:has(input:checked)::before,.choice label:has(input:checked) kbd{color:inherit;border-color:currentColor}
.choice label:has(input:focus-visible){outline:2px solid var(--focus);outline-offset:-3px}

.reject-fields{display:grid;grid-template-columns:auto minmax(220px,1.3fr) minmax(160px,1fr);align-items:center;gap:10px;margin-top:12px;padding:8px 10px 8px 14px;border:1px solid var(--bad-line);border-radius:8px;background:var(--bad-soft)}
.reject-fields label{margin:0;color:var(--bad)}
.story:not(:has(input[value=reject]:checked)) .reject-fields{display:none}
.check-strip{margin:12px 0 0;padding:8px 12px;border:1px solid var(--warn-line);border-radius:8px;background:var(--warn-soft)}

.editor-fields{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(230px,1fr);gap:18px clamp(18px,3cqw,28px);margin-top:16px}
.editor-main,.editor-side{min-width:0}
.editor-section+.editor-section{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
.editor-section>h3{margin-bottom:10px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.field{margin-bottom:12px;min-width:0}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.label-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.label-row label{margin-bottom:5px}
label .hint{font-weight:500;color:var(--muted);opacity:.85}
.sentence-count{font-size:12px;font-weight:600;color:var(--muted)}
.sentence-count.ok{color:var(--ok)}
.sentence-count.warn{color:var(--warn)}
.editor-fields textarea{field-sizing:content;max-height:40dvh}
.headline-input{font-size:16px;font-weight:600;line-height:1.45;min-height:64px}
.editor-fields .comment-input{font-size:15px;line-height:1.6;min-height:112px}
.field-help{color:var(--muted);font-size:12.5px;margin-top:6px}
.find-source{font-size:13px}
.story-excerpt{padding:10px 12px;border-left:2px solid var(--line-3);border-radius:0 6px 6px 0;background:var(--bg-2);font-size:13px;line-height:1.55;color:var(--muted)}
.story-excerpt .lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}
.signals{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 6px}
.signals .lbl{flex-basis:100%;font-size:12px;font-weight:600;color:var(--muted)}
.cluster-list{font-size:13px;line-height:1.5;margin:4px 0 10px;padding-left:18px}
.cluster-list li{overflow-wrap:anywhere}
.editor-fields .opts{display:grid;gap:7px}
.editor-fields .opts label{line-height:1.45}
.fetch-summary{margin-top:12px}
.fetch-summary p{margin-top:6px}

@container (max-width:620px){.editor-fields{grid-template-columns:minmax(0,1fr);gap:0}
.editor-side{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
}
@container (max-width:560px){.reject-fields{grid-template-columns:minmax(0,1fr)}
.choice label{min-width:0;flex:1}
.decide{flex:1 1 100%}
}

#review-preview{width:min(720px,calc(100vw - 32px));max-height:85dvh;padding:24px;background:var(--panel);color:var(--text);border:1px solid var(--line-2);border-radius:12px}
#review-preview::backdrop{background:rgba(5,9,18,.8)}
#review-preview h2{font-size:20px;margin-bottom:12px}
#review-preview h3{margin:18px 0 8px}
#review-preview-body{max-height:55dvh;overflow-y:auto;padding-right:6px}
#review-preview li{padding:6px 0;border-bottom:1px solid var(--line)}
.dialog-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:20px}

/* Analytics shares the controls but gives its event stream a dedicated width. */
.analytics-workspace{container-type:inline-size}
.analytics-workspace :is(a,summary,h2){scroll-margin-top:80px}
.overview{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@container (min-width:1000px){.overview{grid-template-columns:minmax(400px,5fr) minmax(0,7fr)}
}
.kpi-panel .eyebrow{margin-bottom:12px}
.kpi-main{display:flex;gap:24px;align-items:center}
.kpi-main .stat{padding:0;border:0;background:none;white-space:nowrap}
.kpi-main .stat b{font-size:34px}
.kpi-split{flex:1;min-width:0}
.split{display:flex;height:8px;border-radius:5px;overflow:hidden;background:var(--sunk)}
.split span{display:block;height:100%}
.split .human,.key.human::before{background:var(--chart-human)}
.split .automated,.key.automated::before{background:var(--chart-auto)}
.key{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);white-space:nowrap}
.key::before{content:"";width:9px;height:9px;border-radius:3px}
.keys{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px}
.panel-head .keys{margin:0}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.5fr);gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
.kpis .stat{padding:0;border:0;background:none;font-size:12.5px}
.kpis .stat b{font-size:20px}
.chart-panel{display:flex;flex-direction:column;min-height:240px}
.chart-note{margin:0 0 6px}
.chart-window{display:inline-flex;border:1px solid var(--line-2);border-radius:7px;overflow:hidden}
.chart-window input{position:absolute;opacity:0;width:1px;height:1px}
.chart-window label{margin:0;padding:4px 10px;font-size:12.5px;font-weight:500;color:var(--muted);cursor:pointer;border-right:1px solid var(--line)}
.chart-window label:last-child{border:0}
.chart-window input:checked+label{background:var(--info-soft);color:var(--text)}
.chart-window input:focus-visible+label{outline:2px solid var(--focus);outline-offset:-2px}
.chart{position:relative;flex:1;min-height:118px;padding:14px 0 0;overflow-x:auto;overscroll-behavior-x:contain}
.chart .cols{display:flex;gap:3px;height:100%;width:max-content;min-width:100%}
.chart.dense .cols{gap:1px}
.chart .col{flex:1 0 4px;display:flex;flex-direction:column;position:relative;z-index:1}
.chart .plot{flex:1;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid var(--line-2)}
.chart .day-bar{width:min(100%,26px);height:var(--h-all);display:flex;flex-direction:column;justify-content:flex-end;background:var(--chart-auto);border-radius:2px 2px 0 0;overflow:hidden}
.chart .day-bar i{display:block;background:var(--chart-human)}
.chart .col:hover .day-bar{filter:brightness(1.3)}
.chart .x{width:0;align-self:center;height:18px;padding-top:4px;font-size:10.5px;line-height:1;color:var(--faint);white-space:nowrap;display:flex;justify-content:center}
.chart .peak{position:absolute;left:0;right:0;top:14px;border-top:1px dashed var(--line-2);pointer-events:none}
.chart .peak span{position:absolute;left:0;bottom:2px;font-size:10px;line-height:1;color:var(--faint)}
.chart :is(.x-30,.x-7,.peak-30,.peak-7),.chart-note :is(.note-30,.note-7){display:none}
.chart .in-all:first-child .x,.chart-panel:has(#cw-30:checked) .in-30:not(.in-30~.in-30) .x,.chart-panel:has(#cw-7:checked) .in-7:not(.in-7~.in-7) .x{align-self:flex-start;justify-content:flex-start}
.chart .col:last-child .x{align-self:flex-end;justify-content:flex-end}
.chart-panel:has(#cw-30:checked) .col:not(.in-30),.chart-panel:has(#cw-7:checked) .col:not(.in-7){display:none}
.chart-panel:has(#cw-30:checked) .day-bar{height:var(--h-30)}
.chart-panel:has(#cw-7:checked) .day-bar{height:var(--h-7)}
.chart-panel:has(#cw-30:checked) :is(.x-all,.peak-all,.note-all),.chart-panel:has(#cw-7:checked) :is(.x-all,.peak-all,.note-all){display:none}
.chart-panel:has(#cw-30:checked) :is(.x-30,.peak-30,.note-30),.chart-panel:has(#cw-7:checked) :is(.x-7,.peak-7,.note-7){display:inline}
.chart-empty{flex:1;display:grid;place-items:center;min-height:118px;color:var(--muted);font-size:13px;border:1px dashed var(--line);border-radius:var(--r-sm)}

.filterbar{padding:16px 18px;border:1px solid var(--line);border-radius:var(--r);background:var(--panel)}
.filterbar .panel-head{margin-bottom:10px}
.filter-row{display:grid;gap:10px 12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));align-items:end}
.filter-apply{display:flex;gap:6px;align-items:center}
.filter-more{margin-top:12px}
.filter-more>summary{font-weight:600}
.filter-more .filter-row{margin-top:2px}
.filter-foot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-top:12px;margin-top:12px;border-top:1px solid var(--line)}
.filter-foot .actions{gap:6px}
.filter-foot .btn{min-height:30px;padding:3px 10px;font-size:12.5px}
#analytics-pager{min-width:0;max-width:100%}
#analytics-page{max-width:100%}
.ip-link{color:var(--info);text-decoration:underline;font-weight:600}
#analytics-freshness{margin-bottom:8px}

.events-table{display:block;width:100%;min-width:1680px;font-size:13px}
.events-table>:is(thead,tbody){display:block}
.events-table tr{display:grid;grid-template-columns:var(--cols-xl);gap:12px;padding:0 16px;align-items:center;border-bottom:1px solid var(--line)}
.events-table :is(th,td){display:block;padding:9px 0;border:0;min-width:0;white-space:nowrap;background:none}
.events-table thead{position:sticky;top:0;z-index:2;background:var(--bg-2)}
.events-table thead tr{background:var(--bg-2)}
.events-table th{position:relative;font-size:10.5px;letter-spacing:.03em;padding:10px 0}
.events-table th[title]{cursor:help;text-decoration:underline dotted var(--line-3);text-underline-offset:4px}
.events-table tbody tr:nth-child(even){background:rgba(142,160,201,.025)}
.events-table tbody tr:hover{background:rgba(142,160,201,.05)}
.events-table tbody tr:hover td{background:none}
.events-table tbody tr:last-child{border:0}
.events-table .c-all{font-weight:650}
.events-table .of{font-size:11.5px;color:var(--muted)}
.events-table td.wrap{white-space:normal;overflow-wrap:anywhere;min-width:0;line-height:1.5}
.events-table td:not(.c-time){white-space:normal;overflow-wrap:anywhere}
.events-table .two{display:flex;flex-direction:column;white-space:normal;line-height:1.45}
.events-table .two .sub{font-size:11.5px;color:var(--muted)}
.events-table .cc{font-weight:650}
.events-table td.empty{grid-column:1/-1;white-space:normal}
.src,.actor{font-size:12.5px}
.src.legacy{color:var(--warn)}
.src.native,.actor.auto{color:var(--muted)}
.actor.human{color:var(--info)}
.actor::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:5px}
.events-table .mono{font-size:12px}
.events-table td.more{white-space:normal;text-align:right}
.events-table tr:has(details[open])>td.more{grid-column:1/-1;text-align:left}
.event-details>summary{display:block;width:max-content;margin-left:auto;font-size:12.5px;border:1px solid var(--info-line);border-radius:6px;padding:2px 8px;list-style:none}
.event-details>summary::-webkit-details-marker{display:none}
.event-details>summary:hover{background:var(--info-soft)}
.event-fields{position:sticky;left:20px;width:calc(100cqw - 40px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px 24px;padding:18px;background:var(--sunk);border-radius:8px;margin:10px 0}
.event-fields>div{min-width:0}
.event-fields dt{font-size:11.5px;color:var(--muted);margin-bottom:2px}
.event-fields dd{margin:0;overflow-wrap:anywhere;font-size:13px}
.ip-address{font-size:20px;overflow-wrap:anywhere;margin-bottom:10px}
.activity-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}

@container (max-width:900px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
.kpi-main{flex-wrap:wrap}
.kpi-split{flex-basis:100%}
.activity-overview .kv{grid-template-columns:minmax(0,1fr);gap:2px}
.activity-overview .kv dd{margin-bottom:8px}
}

@media (max-width:1180px) and (min-width:961px){:root{--sidebar:208px}
.sidebar{width:208px}
.key-hint{display:none}
.detail-paging{margin-left:auto}
.story{padding:16px 18px 20px}
}

/* Tablet and phone: drawer navigation, list/detail review, fixed batch bar. */
@media (max-width:960px){
.workspace{margin-left:0}
main{padding:20px 20px 40px}
.envbar{margin-left:0;padding:6px 20px}
.skip-link{left:16px}
.mobile-nav{display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;height:var(--mobile-head);padding:0 20px;background:var(--bg-2);border-bottom:1px solid var(--line)}
.mobile-nav .brand{font-size:18px}
.nav-toggle{display:block;position:fixed;top:20px;left:24px;opacity:0;width:1px;height:1px}
.nav-toggle:focus-visible~.mobile-nav .menu-label{outline:2px solid var(--focus);outline-offset:2px}
.menu-label,.drawer-close{cursor:pointer;border:1px solid var(--control-line);border-radius:7px;padding:5px 12px;color:var(--text);font-size:13px;margin:0}
.sidebar{width:min(280px,86vw);visibility:hidden;transform:translateX(-100%)}
.nav-toggle:checked~.sidebar{visibility:visible;transform:none}
.drawer-close{display:block;align-self:flex-end;margin-bottom:16px}
.nav-toggle:checked~.drawer-shade{display:block;position:fixed;inset:0;z-index:25;background:rgba(0,0,0,.65);margin:0}

.review-workspace{padding-bottom:120px}
.review-top{padding:12px 14px}
.review-apply-bar{position:fixed;bottom:0;left:20px;right:20px;z-index:15;justify-content:space-between;padding:10px 10px 10px 16px;background:var(--bg-2);border:1px solid var(--line-2);border-bottom:0;border-radius:12px 12px 0 0;box-shadow:0 -10px 24px rgba(11,17,32,.7)}
.apply-status{text-align:left}
.apply-status p{display:none}
.review-workbench.is-enhanced{display:block;height:auto;min-height:0}
.review-queue{overflow:visible}
.story-queue-list{overflow:visible}
.is-enhanced[data-mobile-view=list] .review-detail{display:none}
.is-enhanced[data-mobile-view=detail] .review-queue{display:none}
.review-detail{overflow:visible}
.back-to-stories{display:inline-flex}
.detail-navigation{position:sticky;top:var(--mobile-head);z-index:6;padding:8px 10px;border-radius:var(--r) var(--r) 0 0}
.key-hint,.choice kbd{display:none}
.detail-paging{margin-left:auto}
.review-tools{position:sticky;top:var(--mobile-head);z-index:7;border-radius:var(--r) var(--r) 0 0}
.story-picker{padding:12px 14px 12px 11px}
}

@media (max-width:600px){
main{padding:16px 14px 36px}
h1{font-size:21px}
.page-head{grid-template-columns:minmax(0,1fr);gap:8px;margin-bottom:16px}
.page-head>:not(h1):not(.lede){grid-row:auto;grid-column:1;justify-self:start;order:2}
.page-head .lede{order:1}
.page-head .lede{font-size:13px}
.mobile-nav{padding:0 14px}
.envbar{padding:6px 14px}
.envbar span{display:none}
.card,.panel,.filterbar{padding:16px}
.stats{grid-template-columns:repeat(2,minmax(0,1fr))}
.stats>.stat{border-bottom:1px solid var(--line)}
.stats>.stat:nth-child(2n){border-right:0}
.stats.reaction-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
.reaction-stats .stat:nth-child(-n+2){grid-column:span 2}
.reaction-stats .stat:nth-child(2){border-right:0}
.reaction-stats .stat:nth-child(n+3){border-bottom:0;padding:12px 10px}
.reaction-stats .stat:nth-child(n+3) b{font-size:18px}
.reaction-stats .stat:nth-child(6){border-right:0}
.health-workspace .stats{grid-template-columns:repeat(3,minmax(0,1fr))}
.health-workspace .stats>.stat{border-bottom:0;border-right:1px solid var(--line);padding:12px}
.health-workspace .stats>.stat:last-child{border-right:0}
.toolbar input{flex-basis:100%;max-width:none}
.toolbar select{flex:1;min-width:0}
.toolbar button{flex:1}
.toolbar .sort-select{flex:1;min-width:100px}
.toolbar .search-submit{flex-basis:100%}
.toolbar:has(#reaction-sort) label{flex-basis:100%;margin:0}
.table-foot{padding:10px 12px}
.table-foot .actions{gap:6px;max-width:100%}
.table-foot form{flex-wrap:wrap;min-width:0}
.table-foot form select{max-width:100%}
.table-foot form label{flex:none}
.seg{width:100%}
.seg a{flex:1;text-align:center;padding:6px 4px}
.section.minor{margin-top:28px}

.record-table,.record-table tbody{display:block}
.record-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.record-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;padding:14px;border-bottom:1px solid var(--line)}
.record-table td{display:block;white-space:normal;min-width:0;width:auto;padding:0;border:0;overflow-wrap:anywhere;font-size:13.5px}
.record-table td::before{content:attr(data-label);display:block;color:var(--muted);font-size:11.5px;margin-bottom:2px}
.record-table td.wrap,.record-table td.empty{grid-column:1/-1}
.record-table td.num{text-align:left}
.health-table td:first-child{font-weight:600}
.health-table td:empty{display:none}

.published-table,.published-table tbody,.reactions-table,.reactions-table tbody{display:block}
.published-table thead,.reactions-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.published-table tr,.reactions-table tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 14px;padding:14px;border-bottom:1px solid var(--line)}
.published-table td,.reactions-table td{display:block;white-space:normal;min-width:0;width:auto;padding:0;border:0;font-size:13px;overflow-wrap:anywhere;text-align:left}
.published-table td::before,.reactions-table td::before{content:attr(data-label);display:block;font-size:11px;color:var(--muted);margin-bottom:2px;font-weight:500}
.published-table td.wrap,.reactions-table td.wrap{min-width:0;width:auto}
.published-table td.wrap,.reactions-table td.wrap{grid-column:1/-1}
.published-table td.wrap{grid-row:1;font-size:15px;line-height:1.4}
.published-table td.wrap::before,.reactions-table td.wrap::before{display:none}
.published-table td:last-child{grid-column:3;grid-row:2;align-self:end;text-align:right}
.published-table td:last-child::before{display:none}
.published-table td .clip{max-width:100%}
.published-table td.id-cell{grid-row:2}
.reactions-table tr{grid-template-columns:repeat(5,minmax(0,1fr))}
.reactions-table td:first-child{grid-column:1/-1}
.reactions-table td.wrap{font-size:15px}
.reactions-table td.num{min-width:0}
.reactions-table td:last-child{background:none;font-weight:700}
.reactions-table td.empty,.published-table td.empty{grid-column:1/-1}

.review-top{display:block}
.review-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 10px;font-size:12px}
.review-summary b{display:block;font-size:20px}
.review-summary .summary-risk{grid-column:1/-1;font-size:12px}
.review-summary .summary-risk b{display:inline;font-size:12px}
#review-scope{margin-top:6px}
.review-apply-bar{left:8px;right:8px;gap:10px;padding:8px 8px 8px 12px}
.review-apply-bar button{min-width:0;padding:6px 14px}
.review-counts{font-size:12.5px}
.review-workspace{padding-bottom:96px}
.story{padding:14px 14px 18px}
.detail-navigation{gap:6px}
.detail-paging button,.back-to-stories{min-height:32px;padding:3px 9px;font-size:12.5px}
#review-position{font-size:12px}
.queue-find{grid-template-columns:minmax(0,1fr)}
#review-preview{padding:18px}
.dialog-actions button{width:100%}
.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.kpi-main .stat b{font-size:30px}
.event-fields{grid-template-columns:minmax(0,1fr)}
}

@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}
}
`;
