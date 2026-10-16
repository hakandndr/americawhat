// Shared Boss design system. No external assets or runtime styling dependency.
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
--r:8px;--r-sm:6px;--shell:1480px;--chart-human:#7aa2e3;--chart-auto:rgba(142,160,201,.26);
--font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--mono:ui-monospace,"Cascadia Mono",Consolas,"SFMono-Regular",monospace}

/* Foundations: one scale for reading, editing and reporting. */
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:80px}

body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 var(--font);-webkit-font-smoothing:antialiased}

[hidden]{display:none!important}
a{color:var(--info);text-decoration-color:var(--info-line);text-underline-offset:4px}
a:hover{color:var(--text);text-decoration-color:currentColor}

:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}

code,.mono{font:13px/1.6 var(--mono);overflow-wrap:anywhere}
code{color:var(--muted)}

h1,h2,h3,p{margin:0}
h1{font-size:30px;line-height:1.25;letter-spacing:-.035em;font-weight:700}
h2{font-size:20px;line-height:1.4;font-weight:650;letter-spacing:-.02em}
h3{font-size:16px;line-height:1.5;font-weight:650}

p+p{margin-top:12px}
ul{margin:10px 0;padding-left:22px}
li{margin:5px 0}

.muted,.faint{color:var(--muted)}
.small{font-size:14px}
.nowrap{white-space:nowrap}
.ok{color:var(--ok)}
.warn{color:var(--warn)}
.bad{color:var(--bad)}

.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

.eyebrow{font-size:13px;font-weight:650;color:var(--muted);letter-spacing:.04em}

.section{margin-top:32px}
.section.minor{margin-top:40px;padding-top:28px;border-top:1px solid var(--line)}

.section-head,.panel-head,.stream-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 24px;margin-bottom:16px}
.section-head p,.stream-head p{color:var(--muted)}

.card,.panel,.table-card{min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:12px}

.card,.panel{padding:24px}
.card{margin-bottom:20px}
.card h2,.card h3{margin-bottom:12px}
.card.quiet{background:var(--bg-2)}

.flash,.notice{padding:14px 18px;border-radius:10px;margin-bottom:20px;background:var(--bg-2);border:1px solid var(--line);color:var(--muted)}

.flash{border-left:3px solid var(--ok)}
.flash.err{border-color:var(--bad-line);border-left-color:var(--bad);color:var(--bad);background:var(--bad-soft)}

.notice{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px}
.notice.warn{border-color:var(--warn-line);background:var(--warn-soft);color:var(--warn)}
.notice .lbl{font-weight:700}

.empty{padding:48px 24px;text-align:center;color:var(--muted)}

/* Navigation and centered workspaces. */
.skip-link{position:fixed;left:252px;top:-80px;z-index:50;background:var(--panel);padding:12px}
.skip-link:focus{top:8px}

.sidebar{position:fixed;inset:0 auto 0 0;width:232px;z-index:30;background:var(--bg-2);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:28px 16px 20px;overflow-y:auto}

.brand{display:flex;align-items:baseline;gap:8px;color:var(--text);text-decoration:none;font-weight:800;font-size:20px;letter-spacing:-.035em;white-space:nowrap}
.brand i{font-style:normal;color:var(--accent-text)}
.brand small{font-size:10px;font-weight:650;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}

.sidebar .brand{padding:0 8px 34px}
.nav{display:grid;gap:6px}
.nav a{display:flex;align-items:center;gap:10px;padding:12px;color:var(--muted);border-radius:8px;text-decoration:none;font-weight:500;border-left:3px solid transparent}
.nav a:hover{background:var(--panel);color:var(--text)}
.nav a.on{background:var(--panel);border-left-color:var(--accent);color:var(--text);font-weight:650}

.nav-icon{width:18px;height:18px;flex:none;opacity:.8}
.nav-count{margin-left:auto;padding:1px 8px;min-width:27px;text-align:center;border-radius:6px;background:var(--accent-strong);color:var(--on-accent);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.nav-count.neutral{background:var(--line);color:var(--text)}

.sidebar-footer{margin-top:auto;padding-top:40px}
.quick-links{border-top:1px solid var(--line-2);padding:20px 8px;display:grid;gap:12px}
.quick-links h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.quick-links a{font-size:14px;color:var(--muted);text-decoration:none}
.quick-links a:hover{color:var(--text)}
.who{display:block;font-size:13px;border-top:1px solid var(--line);padding:16px 8px 0;color:var(--muted);overflow-wrap:anywhere}

.workspace{margin-left:232px;min-width:0}
main{width:100%;max-width:1800px;margin:0 auto;padding:40px clamp(24px,2.5vw,48px) 64px;min-width:0}
main.analytics-workspace{max-width:1940px}
main.form-workspace,main.health-workspace{max-width:1280px}

.envbar{margin-left:232px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 24px;background:var(--sunk);border-bottom:1px solid var(--line);color:var(--muted);font-size:13px}
.envbar b{font-size:12px;letter-spacing:.08em;color:var(--info)}

.page-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px 24px;margin-bottom:28px}
.page-head .lede{grid-column:1/-1;color:var(--muted);font-size:14px;max-width:120ch;line-height:1.7}

.mobile-nav,.drawer-close,.drawer-shade,.nav-toggle{display:none}

/* Comfortable shared forms and actions. */
label{display:block;font-size:14px;font-weight:550;color:var(--muted);margin-bottom:7px}

input,select,textarea{width:100%;min-width:0;min-height:46px;border:1px solid var(--control-line);border-radius:7px;background:var(--sunk);color:var(--text);padding:10px 13px;font:inherit}

input::placeholder,textarea::placeholder{color:var(--muted);opacity:1}
input:hover,select:hover,textarea:hover{border-color:var(--info)}

input:focus,select:focus,textarea:focus{outline:none;border-color:var(--focus);box-shadow:0 0 0 3px var(--focus-soft)}

select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 17px) 52%,calc(100% - 12px) 52%;background-size:5px 5px;background-repeat:no-repeat;padding-right:34px}

textarea{min-height:160px;resize:vertical;line-height:1.8}
input[type=radio],input[type=checkbox]{width:18px;height:18px;min-height:0;accent-color:var(--focus);margin:0;flex:none}
input[type=file]{padding:8px}

button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 18px;border:1px solid var(--accent-strong);border-radius:7px;background:var(--accent-strong);color:var(--on-accent);font:600 14px/1.5 var(--font);text-decoration:none;white-space:nowrap;cursor:pointer}

button:hover,.btn:hover{background:var(--accent-hover);border-color:var(--accent-hover);color:var(--on-accent)}
button:active,.btn:active{background:var(--accent-active)}

button.secondary,.btn.secondary{background:transparent;border-color:var(--control-line);color:var(--text)}
button.secondary:hover,.btn.secondary:hover{background:var(--info-soft);border-color:var(--info)}

.btn.ghost{background:transparent;border-color:transparent;color:var(--muted);font-weight:500}
.btn.ghost:hover{background:var(--info-soft);color:var(--text)}
button.danger{background:transparent;color:var(--bad);border-color:var(--bad-line)}
button.danger:hover{background:var(--accent-strong);color:var(--on-accent);border-color:var(--accent-strong)}

button:disabled{opacity:.5;cursor:not-allowed}
.btn[aria-disabled=true]{opacity:.5;cursor:default}

.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:20px}
.cols-2,.cols-4{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.cols-4{grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr))}

.actions,.opts{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px}
.actions label,.opts label{display:inline-flex;gap:9px;align-items:center;margin:0;color:var(--muted);font-size:14px}
.actions input:not([type=radio]):not([type=checkbox]),.actions select{width:auto;max-width:100%}
.opts{align-items:flex-start}

.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:12px;margin-bottom:20px}
.toolbar input{flex:1 1 300px;max-width:640px}
.toolbar select{width:auto;max-width:100%;min-width:180px}
.form-foot{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding-top:24px;margin-top:24px;border-top:1px solid var(--line)}

fieldset{padding:20px;border:1px solid var(--line);border-radius:10px;min-width:0;margin:0}
legend{font-size:14px;color:var(--muted);padding:0 8px}
.filters{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}

.tag{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:5px;font-size:12px;font-weight:550;line-height:1.7;color:var(--muted);background:var(--bg-2);border:1px solid var(--line);max-width:100%;overflow-wrap:anywhere}

.tag.ok,.tag.geo-us_likely{color:var(--ok);background:var(--ok-soft);border-color:var(--ok-line)}
.tag.warn,.tag.flag,.tag.geo-foreign_likely{color:var(--warn);background:var(--warn-soft);border-color:var(--warn-line)}
.tag.info{color:var(--info);background:var(--info-soft);border-color:var(--info-line)}
.tag.strong{color:var(--text)}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}
.stat{padding:20px 24px;border:1px solid var(--line);background:var(--panel);border-radius:10px;font-size:14px;color:var(--muted);line-height:1.5}
.stat b{display:block;font-size:32px;line-height:1.3;letter-spacing:-.035em;color:var(--text);font-variant-numeric:tabular-nums;margin-bottom:4px}
.stat b.warn{color:var(--warn)}
.stat b.bad{color:var(--bad)}

.published-editor>.grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.published-editor .headline-input{min-height:100px}
.published-editor #p-comment{min-height:200px;font-size:16px}
.toolbar label{margin:0}
.toolbar .sort-select{min-width:120px}
.seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--line-2);border-radius:7px;overflow:hidden}
.seg a{padding:10px 16px;text-decoration:none;color:var(--muted);font-size:14px}
.seg a.on{background:var(--info-soft);color:var(--text)}
.seg a:hover{background:var(--panel)}


/* Data surfaces keep their reading size; only their own viewport scrolls. */
.table-card{overflow:hidden;margin-bottom:20px}
.scroll,.event-scroll{overflow-x:auto;overscroll-behavior-x:contain;max-width:100%;scrollbar-color:var(--muted) var(--bg-2)}
.event-scroll{position:relative;max-height:75dvh;overflow:auto}
.scroll:focus-visible,.event-scroll:focus-visible{outline-offset:-3px}

table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
th,td{padding:18px 20px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle;white-space:nowrap}
th{background:var(--bg-2);font-size:12px;font-weight:650;letter-spacing:.035em;color:var(--muted);text-transform:uppercase}
tbody tr:hover td{background:rgba(142,160,201,.045)}
tbody tr:last-child td{border-bottom:0}

td.wrap{white-space:normal;min-width:280px;overflow-wrap:anywhere;line-height:1.65}
td.num,th.num{text-align:right}
td .sub{display:block;color:var(--muted);font-size:13px;margin-top:5px}
td .clip{display:block;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.table-foot{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 20px;background:var(--bg-2);border-top:1px solid var(--line)}
.table-card>h2{padding:20px 20px 0}

.published-table .headline{font-size:16px;font-weight:600;color:var(--text);text-decoration:none}
.published-table .headline:hover{text-decoration:underline;text-decoration-color:var(--info)}
.published-table td.wrap{width:38%;min-width:320px}
.published-table .live-path{font-size:12px}
.published-table .id-cell{color:var(--muted)}

.reactions-table td.wrap{width:60%;min-width:320px;font-size:16px;font-weight:550}
.reactions-table td.wrap a{color:var(--text);text-decoration:none}
.reactions-table td.wrap a:hover{text-decoration:underline}
.reactions-table td.num{min-width:90px;font-size:16px}
.reactions-table th a{display:block;min-height:28px;text-decoration:none}
.reactions-table td:last-child{color:var(--text);background:var(--info-soft)}

.pager{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.pager a,.pager span{min-width:40px;padding:8px 12px;text-align:center;border:1px solid var(--line-2);border-radius:6px;text-decoration:none;color:var(--muted);font-size:14px}
.pager a:hover{background:var(--panel);color:var(--text)}
.pager .on{background:var(--info-soft);border-color:var(--info);color:var(--text)}
.pager .gap{border-color:transparent}

details summary{cursor:pointer;color:var(--info);font-size:14px}
details[open]>summary{margin-bottom:16px}
.kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 24px;min-width:0;font-size:14px;white-space:normal}
.kv dt{color:var(--muted)}
.kv dd{margin:0;overflow-wrap:anywhere}

.danger-zone{border-color:var(--bad-line)}
.danger-zone h2{color:var(--bad)}
.status{display:inline-flex;align-items:center;gap:9px;font-size:14px;font-weight:600}
.status::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.health-workspace td.wrap{width:60%}

.bars{list-style:none;margin:0;padding:0}
.bar{display:flex;align-items:center;gap:14px;padding:10px 0;margin:0;border-bottom:1px solid var(--line);font-size:14px}
.bar:last-child{border:0}
.bar .v{flex:1;min-width:0;overflow-wrap:anywhere}
.bar .n{font-variant-numeric:tabular-nums;color:var(--muted);min-width:4ch;text-align:right}
.bar .track{width:64px;height:5px;border-radius:4px;background:var(--sunk);flex:none;overflow:hidden}
.bar .fill{display:block;height:100%;background:var(--info-fill)}

/* Review: a sticky queue beside one naturally scrolling editorial document. */
.review-summary{display:flex;flex-wrap:wrap;gap:12px 28px;margin-bottom:12px;color:var(--muted);font-size:14px}
.review-summary b{font-size:20px;color:var(--text);margin-right:4px}
.review-summary .summary-risk{margin-left:auto;font-size:13px}
.review-summary .summary-risk b{font-size:14px}

#review-scope{margin-bottom:28px}
.review-workbench.is-enhanced{display:grid;grid-template-columns:minmax(300px,1fr) minmax(0,2.05fr);gap:28px;align-items:start}
.review-queue{position:sticky;top:24px;max-height:calc(100dvh - 132px);display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden}

.fetch-summary{margin-top:24px}
.fetch-summary p{margin-top:12px}

.review-tools{padding:20px;display:grid;gap:12px;border-bottom:1px solid var(--line)}
.queue-heading{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.queue-heading h2{font-size:18px}
.review-tools label{margin:0}
.queue-bulk{display:flex;gap:8px;flex-wrap:wrap}
.queue-bulk button{min-height:40px;padding:8px 12px;font-size:13px;white-space:normal}
.review-tools button.is-selected{color:var(--ok);background:var(--ok-soft);border-color:var(--ok)}
.review-selected{font-size:14px;font-weight:600;color:var(--ok)}
.review-selected:empty{display:none}

.story-queue-list{list-style:none;margin:0;padding:4px 0;overflow-y:auto;overscroll-behavior:contain;min-height:0}
.queue-item{margin:0}
.story-picker{width:100%;display:grid;grid-template-columns:25px minmax(0,1fr);gap:10px;padding:18px 20px;border:0;border-left:3px solid transparent;border-bottom:1px solid var(--line);border-radius:0;background:transparent;text-align:left;white-space:normal;color:var(--text);font-weight:500}
.story-picker:hover{background:var(--bg-2);border-color:var(--line);border-left-color:var(--info)}
.story-picker[aria-pressed=true]{background:var(--info-soft);border-left-color:var(--info)}

.queue-rank{font-size:12px;color:var(--muted);padding-top:3px}
.queue-copy{display:grid;gap:7px;min-width:0}
.queue-title{font-size:15px;line-height:1.5;font-weight:600}
.queue-source{font-size:13px;color:var(--muted);line-height:1.5}
.queue-status{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--muted)}
.queue-status [data-queue-decision]{font-weight:700}
.story-picker[data-choice=approve] [data-queue-decision]{color:var(--ok)}
.story-picker[data-choice=reject] [data-queue-decision]{color:var(--bad)}

.review-detail{min-width:0;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.detail-navigation{position:sticky;top:0;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 28px;border-bottom:1px solid var(--line);background:var(--panel);border-radius:12px 12px 0 0;scroll-margin-top:20px}
.detail-navigation>span{font-size:14px;color:var(--muted)}
.detail-paging{display:flex;gap:8px}
.detail-paging button{min-height:40px;padding:8px 12px}
.back-to-stories{display:none}
.filter-notice{padding:12px 28px;color:var(--warn);background:var(--warn-soft)}

.review-editor-scroll{min-width:0}
.story{padding:28px;margin:0;background:var(--panel);border-radius:12px}
.story+.story{margin-top:24px}
.story-head .rank{display:none}
.story-title{font-size:25px;line-height:1.4;letter-spacing:-.025em;overflow-wrap:anywhere;margin-bottom:12px}
.story-meta{font-size:14px;color:var(--muted);overflow-wrap:anywhere;margin-bottom:16px}
.story-status{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.decision-status{font-size:14px;font-weight:600;color:var(--info)}
.draft-preview{display:none}

.decide{position:sticky;top:73px;z-index:5;padding:16px 0;margin:8px 0 4px;background:var(--panel)}
.choice{display:flex;gap:10px}
.choice label{display:flex;align-items:center;justify-content:center;flex:1;gap:9px;min-height:48px;padding:10px 14px;border:1px solid var(--control-line);border-radius:7px;color:var(--muted);font-size:15px;cursor:pointer;margin:0}
.choice label:hover{background:var(--info-soft);color:var(--text)}
.choice .a:has(input:checked){color:var(--ok);border-color:var(--ok);background:var(--ok-soft)}
.choice .r:has(input:checked){color:var(--bad);border-color:var(--bad);background:var(--bad-soft)}
.choice .s:has(input:checked){color:var(--text);border-color:var(--info);background:var(--info-soft)}
.choice label:has(input:focus-visible){outline:2px solid var(--focus);outline-offset:2px}

.reject-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:16px}
.reject-fields input{max-width:none!important}
.story:not(:has(input[value=reject]:checked)) .reject-fields{display:none}

.editor-section{padding-top:28px;margin-top:28px;border-top:1px solid var(--line)}
.editor-section:first-child{border-top:0;margin-top:0;padding-top:20px}
.editor-section>h3{margin-bottom:18px}
.editor-section .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.editor-title,.field-full{grid-column:1/-1}
.headline-input{font-size:20px;font-weight:550;min-height:94px;line-height:1.5}
.editor-fields textarea:not(.headline-input){min-height:180px;font-size:16px;line-height:1.8}
.field-help{color:var(--muted);font-size:13px;margin-top:8px}
.story-excerpt{color:var(--muted);font-size:14px;line-height:1.8;margin:18px 0}
.signals{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.signals .lbl{flex-basis:100%;font-size:13px;font-weight:600;color:var(--muted)}
.editor-fields .opts{display:grid;gap:14px;margin-top:20px}
.editor-fields .opts label{line-height:1.6}
.cluster-list{font-size:14px;line-height:1.7}
.cluster-list li{padding:8px 0;overflow-wrap:anywhere}

.review-apply-bar{position:sticky;bottom:0;z-index:10;display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:24px;padding:18px 24px;background:var(--bg-2);border:1px solid var(--line-2);border-radius:12px;box-shadow:0 -10px 24px rgba(11,17,32,.65)}
.review-counts{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.review-apply-bar p{font-size:13px;color:var(--muted);margin-top:4px}
.review-apply-bar button{min-width:180px}

#review-preview{width:min(780px,calc(100vw - 32px));max-height:85dvh;padding:32px;background:var(--panel);color:var(--text);border:1px solid var(--line-2);border-radius:14px}
#review-preview::backdrop{background:rgba(5,9,18,.8)}
#review-preview h2{font-size:24px;margin-bottom:16px}
#review-preview h3{margin:24px 0 12px}
#review-preview-body{max-height:55dvh;overflow-y:auto;padding-right:8px}
#review-preview li{padding:9px 0;border-bottom:1px solid var(--line)}
.dialog-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px;margin-top:28px}

/* Analytics shares the controls but gives its event stream a dedicated width. */
.analytics-workspace{container-type:inline-size}
.analytics-workspace :is(a,summary,h2){scroll-margin-top:90px}

.overview{display:grid;gap:20px;grid-template-columns:minmax(0,1fr)}
@container (min-width:1000px){.overview{grid-template-columns:minmax(420px,5fr) minmax(0,7fr)}
}

.kpi-panel .eyebrow{margin-bottom:20px}
.kpi-main{display:flex;gap:28px;align-items:center}
.kpi-main .stat{padding:0;border:0;background:none;white-space:nowrap}
.kpi-main .stat b{font-size:44px}
.kpi-split{flex:1;min-width:0}
.split{display:flex;height:9px;border-radius:5px;overflow:hidden;background:var(--sunk)}
.split span{display:block;height:100%}
.split .human,.key.human::before{background:var(--chart-human)}
.split .automated,.key.automated::before{background:var(--chart-auto)}

.key{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);white-space:nowrap}
.key::before{content:"";width:9px;height:9px;border-radius:3px}
.keys{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px}
.panel-head .keys{margin:0}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.5fr);gap:16px;margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}
.kpis .stat{padding:0;border:0;background:none;font-size:13px}
.kpis .stat b{font-size:24px}

.chart-panel{display:flex;flex-direction:column;min-height:280px}
.chart-note{margin:0 0 8px}
.chart-window{display:inline-flex;border:1px solid var(--line-2);border-radius:7px;overflow:hidden}
.chart-window input{position:absolute;opacity:0;width:1px;height:1px}
.chart-window label{margin:0;padding:6px 12px;font-size:13px;color:var(--muted);cursor:pointer;border-right:1px solid var(--line)}
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


.filterbar{padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.filter-row{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));align-items:end}
.filter-apply{display:flex;gap:10px;align-items:center}
.filter-more{margin-top:20px}
.filter-more>summary{font-weight:600;min-height:32px}
.filter-foot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding-top:20px;margin-top:20px;border-top:1px solid var(--line)}
.filter-foot .actions{gap:8px}
.filter-foot .btn{min-height:38px;padding:7px 12px}

#analytics-pager{min-width:0;max-width:100%}
#analytics-page{max-width:100%}
.ip-link{color:var(--info);text-decoration:underline;font-weight:600}

.events-table{display:block;width:100%;min-width:1720px;font-size:14px}
.events-table>:is(thead,tbody){display:block}
.events-table tr{display:grid;grid-template-columns:var(--cols-xl);gap:16px;padding:0 20px;align-items:center;border-bottom:1px solid var(--line)}
.events-table :is(th,td){display:block;padding:16px 0;border:0;min-width:0;white-space:nowrap;background:none}
.events-table thead{position:sticky;top:0;z-index:2;background:var(--bg-2)}
.events-table thead tr{background:var(--bg-2)}
.events-table th{position:relative;font-size:11px;letter-spacing:.015em;padding:16px 0}
.events-table th[title]{cursor:help;text-decoration:underline dotted var(--line-3);text-underline-offset:4px}
.events-table tbody tr:nth-child(even){background:rgba(142,160,201,.025)}
.events-table tbody tr:hover{background:rgba(142,160,201,.045)}
.events-table tbody tr:hover td{background:none}
.events-table tbody tr:last-child{border:0}

.events-table .c-all{font-weight:650}
.events-table .of{font-size:12px;color:var(--muted)}
.events-table td.wrap{white-space:normal;overflow-wrap:anywhere;min-width:0;line-height:1.65}
.events-table td:not(.c-time){white-space:normal;overflow-wrap:anywhere}
.events-table .two{display:flex;flex-direction:column;white-space:normal;line-height:1.6}
.events-table .two .sub{font-size:12px;color:var(--muted)}
.events-table .cc{font-weight:650}
.events-table td.empty{grid-column:1/-1;white-space:normal}
.src,.actor{font-size:13px}
.src.legacy{color:var(--warn)}
.src.native,.actor.auto{color:var(--muted)}
.actor.human{color:var(--info)}
.actor::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:5px}
.events-table .mono{font-size:12px}
.events-table td.more{white-space:normal;text-align:right}
.events-table tr:has(details[open])>td.more{grid-column:1/-1;text-align:left}
.event-details>summary{display:block;width:max-content;margin-left:auto;font-size:13px;border:1px solid var(--info-line);border-radius:6px;padding:5px 9px;list-style:none}
.event-details>summary::-webkit-details-marker{display:none}
.event-details>summary:hover{background:var(--info-soft)}
.event-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px 28px;padding:24px;background:var(--sunk);border-radius:8px;margin:16px 0}
.event-fields>div{min-width:0}
.event-fields dt{font-size:12px;color:var(--muted);margin-bottom:4px}
.event-fields dd{margin:0;overflow-wrap:anywhere;font-size:14px}
.ip-address{font-size:24px;overflow-wrap:anywhere}
.activity-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}

@container (max-width:900px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
.kpi-main{flex-wrap:wrap}
.kpi-split{flex-basis:100%}
.activity-overview .kv{grid-template-columns:minmax(0,1fr);gap:4px}
.activity-overview .kv dd{margin-bottom:12px}
}

@media (max-width:1200px) and (min-width:961px){.review-workbench.is-enhanced{gap:20px;grid-template-columns:300px minmax(0,1fr)}
.story{padding:24px}
.detail-navigation{padding:16px 24px}
.choice label{padding:10px 8px}
.editor-section .grid{grid-template-columns:minmax(0,1fr)}
}

@media (max-width:960px){
 .workspace{margin-left:0}
main{padding:28px 24px 48px}
.envbar{margin-left:0;font-size:12px;padding:8px 24px}
.skip-link{left:16px}
.mobile-nav{display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;padding:14px 24px;background:var(--bg-2);border-bottom:1px solid var(--line)}
.mobile-nav .brand{font-size:20px}

 .nav-toggle{display:block;position:fixed;top:20px;left:24px;opacity:0;width:1px;height:1px}
.nav-toggle:focus-visible~.mobile-nav .menu-label{outline:2px solid var(--focus);outline-offset:2px}
.menu-label,.drawer-close{cursor:pointer;border:1px solid var(--control-line);border-radius:7px;padding:8px 14px;color:var(--text);font-size:14px;margin:0}
.sidebar{width:min(300px,88vw);visibility:hidden;transform:translateX(-100%)}
.nav-toggle:checked~.sidebar{visibility:visible;transform:none}
.drawer-close{display:block;align-self:flex-end;margin-bottom:24px}
.nav-toggle:checked~.drawer-shade{display:block;position:fixed;inset:0;z-index:25;background:rgba(0,0,0,.65);margin:0}

 .review-workbench.is-enhanced{display:block}
.review-queue{position:static;max-height:none}
.story-queue-list{overflow:visible}
.is-enhanced[data-mobile-view=list] .review-detail{display:none}
.is-enhanced[data-mobile-view=detail] .review-queue{display:none}
.back-to-stories{display:inline-flex}
.detail-navigation{top:73px;padding:14px 20px;scroll-margin-top:0;flex-wrap:wrap}
.detail-navigation>span{order:3;flex-basis:100%;font-size:13px}
.detail-paging button{font-size:13px;padding:8px 10px}
.decide{position:static}
.review-workspace{padding-bottom:140px}
.review-summary .summary-risk{margin-left:0;flex-basis:100%}
.review-apply-bar{position:fixed;bottom:0;left:24px;right:24px;padding:14px 18px;gap:12px;flex-wrap:wrap}
.review-apply-bar button{min-width:0;margin-left:auto}
.review-apply-bar p{display:none}
.review-counts{font-size:14px}
.review-tools{padding:24px}
.story-picker{padding:20px 24px}
.queue-title{font-size:16px}
.story{padding:24px}
.story-title{font-size:24px}

}

@media (max-width:600px){.published-editor>.grid{grid-template-columns:minmax(0,1fr)}
.toolbar .sort-select{flex:1;min-width:100px}
.toolbar .search-submit{flex-basis:100%}

 .stats.reaction-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
.reaction-stats .stat{padding:14px 12px}
.reaction-stats .stat:nth-child(-n+2){grid-column:span 2}
.reaction-stats .stat:nth-child(n+3) b{font-size:24px}
.health-workspace .stats{grid-template-columns:repeat(3,minmax(0,1fr))}
.health-workspace .stat{padding:14px 12px;font-size:13px}
.toolbar:has(#reaction-sort) label{flex-basis:100%}

 .record-table,.record-table tbody{display:block}
.record-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.record-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:24px 20px;border-bottom:1px solid var(--line)}
.record-table td{display:block;white-space:normal;min-width:0;width:auto;padding:0;border:0;overflow-wrap:anywhere;font-size:14px}
.record-table td::before{content:attr(data-label);display:block;color:var(--muted);font-size:12px;margin-bottom:5px}
.record-table td.wrap,.record-table td.empty{grid-column:1/-1}
.record-table td.num{text-align:left}
.health-table td:first-child{font-weight:600}
.health-table td:empty{display:none}

 .envbar span{display:none}
.review-workspace .review-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;font-size:13px}
.review-workspace .review-summary b{display:block;font-size:24px}
.review-summary .summary-risk{grid-column:1/-1}
.review-workspace .review-summary .summary-risk b{display:inline;font-size:13px}
.review-queue{overflow:visible}
.review-tools{position:sticky;top:69px;z-index:7;background:var(--panel);border-radius:12px 12px 0 0}

 .published-table,.published-table tbody,.reactions-table,.reactions-table tbody{display:block}
.published-table thead,.reactions-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.published-table tr,.reactions-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px;padding:24px 20px;border-bottom:1px solid var(--line)}
.published-table td,.reactions-table td{display:block;white-space:normal;min-width:0;width:auto;padding:0;border:0;font-size:14px;overflow-wrap:anywhere}
.published-table td::before,.reactions-table td::before{content:attr(data-label);display:block;font-size:12px;color:var(--muted);margin-bottom:5px;font-weight:500}
.published-table td.wrap,.reactions-table td.wrap{min-width:0;width:auto}
.published-table td.wrap,.published-table td.live-path,.published-table td:last-child,.reactions-table td.wrap{grid-column:1/-1}
.published-table td.wrap{grid-row:1}
.published-table td:last-child::before{display:none}
.published-table td:last-child a{width:100%}
.published-table td .clip{max-width:none;white-space:normal}
.reactions-table tr{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.reactions-table td:first-child{grid-column:1/-1}
.reactions-table td.num{min-width:0;text-align:left}
.reactions-table td:last-child{grid-column:1/-1;padding:12px;border-radius:7px}
.reactions-table td:last-child::before{display:inline;margin-right:12px}
.reactions-table td.empty,.published-table td.empty{grid-column:1/-1}

 main{padding:24px 16px 40px}
h1{font-size:28px}
.page-head{grid-template-columns:minmax(0,1fr);gap:12px;margin-bottom:24px}
.page-head>.btn{justify-self:start}
.page-head .lede{font-size:14px}
.mobile-nav{padding:12px 16px}
.mobile-nav .brand{font-size:18px}
.envbar{padding:8px 16px}
.card,.panel,.filterbar{padding:20px}
.grid{gap:18px}
.stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.stat{padding:16px}
.stat b{font-size:28px}
.toolbar{padding:16px;gap:12px}
.toolbar input{flex-basis:100%;max-width:none}
.toolbar select{flex:1;min-width:0}
.toolbar button{flex:1}
.table-foot{padding:16px}
.table-foot .actions{gap:8px;max-width:100%}
.table-foot form{flex-wrap:wrap;min-width:0}
.table-foot form select{max-width:100%}
.table-foot form label{flex:none}
.seg{width:100%}
.seg a{flex:1;text-align:center;padding:9px 8px}
.section-head,.stream-head{gap:8px}
.section.minor{margin-top:32px}

 .review-summary{gap:8px 20px}
.review-summary b{font-size:19px}
#review-scope{font-size:13px;margin-bottom:20px}
.review-tools{padding:20px}
.story-picker{padding:18px 16px;gap:6px}
.story{padding:20px}
.story-title{font-size:22px}
.story-meta{font-size:13px}
.story-status{gap:8px}
.detail-navigation{top:69px;padding:12px 14px;gap:10px}
.detail-navigation .back-to-stories{padding:8px 10px;font-size:13px}
.detail-paging{gap:6px}
.detail-paging button{padding:8px;font-size:13px}
.editor-section .grid{grid-template-columns:minmax(0,1fr)}
.choice{gap:6px}
.choice label{padding:10px 6px;font-size:14px;gap:6px}
.choice input{width:16px;height:16px}
.headline-input{font-size:18px;min-height:110px}
.editor-fields textarea:not(.headline-input){min-height:210px}
.review-workspace{padding-bottom:155px}
.review-apply-bar{left:12px;right:12px;padding:12px}
.review-apply-bar>div{flex-basis:100%}
.review-apply-bar button{width:100%}
.review-counts{font-size:14px}
.review-apply-bar{gap:8px}
#review-preview{padding:24px}
.dialog-actions button{width:100%}
.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.kpi-main .stat b{font-size:40px}
.event-fields{grid-template-columns:minmax(0,1fr)}

}

@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}
}

`;
