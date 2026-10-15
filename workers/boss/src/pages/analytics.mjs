// The single Boss Analytics screen: legacy and native rows together.
// Order of the page: the summary with its daily chart, compact filters and
// exports, the raw event stream (the primary view), breakdowns, then data
// operations. Live filtering (analytics-client.mjs) swaps the four regions by
// id; the filter form itself is never replaced.

import { formatLa, formatLaSeconds, nextDay } from '../../../shared/time.mjs';
import { bars, h, hidden, page, select } from '../html.mjs';
import { analyticsQuery as qs, ipActivityHref, validIpAddress } from '../analytics-links.mjs';
import { columnStyle, eventColumns, eventHead, eventRow } from './analytics-event.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (day) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const share = (n, total) => (total ? Math.round((n / total) * 100) : 0);

function topCard(title, rows) {
  return `<div class="card"><h3>${h(title)}</h3>${bars(rows)}</div>`;
}

/** Every PT day from the first to the last day with records: quiet days are zero bars, not missing ones. */
function continuousDays(days) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const out = [];
  if (!days.length) return out;
  for (let day = days[0].day; day <= days[days.length - 1].day && out.length < 3700; day = nextDay(day)) out.push(byDay.get(day) || { day, n: 0, human: 0 });
  return out;
}

// The chart can narrow to the last 30 or 7 days of the view without a new
// request (CSS only: radio inputs outside the filter form). Every window keeps
// zero days as zero bars and is scaled to its own peak.
const WINDOWS = [['all', 'Whole view', Infinity], ['30', '30 days', 30], ['7', '7 days', 7]];

function axisLabels(days) {
  const every = Math.ceil(days.length / 6);
  return days.map((d, i) => (i === 0 || i === days.length - 1 || (i % every === 0 && days.length - 1 - i >= every / 2) ? shortDay(d.day) : ''));
}

function dailyChart(records) {
  const days = continuousDays(records);
  const keys = '<span class="keys"><span class="key human">human</span><span class="key automated">automated</span></span>';
  if (days.length < 2) {
    const note = days.length ? `Every record in this view is from ${h(shortDay(days[0].day))}; widen the range for a daily trend.` : 'No records in this view.';
    return `<div class="panel chart-panel"><div class="panel-head"><h3>Page views per day (PT)</h3>${keys}</div><div class="chart-empty">${note}</div></div>`;
  }
  const windows = WINDOWS.filter(([, , n], i) => i === 0 || days.length > n).map(([id, label, n]) => {
    const list = days.slice(-Math.min(n, days.length));
    const max = Math.max(...list.map((d) => d.n), 1);
    const peak = list.find((d) => d.n === max);
    return { id, label, first: days.length - list.length, max, peak, total: list.reduce((s, d) => s + d.n, 0), labels: axisLabels(list) };
  });
  const cols = days.map((d, i) => {
    const vars = windows.filter((w) => i >= w.first).map((w) => `--h-${w.id}:${d.n ? Math.max(2, Math.round((d.n / w.max) * 100)) : 0}%`).join(';');
    const inWindows = windows.filter((w) => i >= w.first).map((w) => `in-${w.id}`).join(' ');
    const labels = windows.filter((w) => i >= w.first).map((w) => `<span class="x-${w.id}">${h(w.labels[i - w.first])}</span>`).join('');
    return `<span class="col ${inWindows}" style="${vars}" title="${h(d.day)}: ${d.n} page views · ${d.human} human · ${d.n - d.human} automated"><span class="plot"><span class="day-bar"><i style="height:${share(d.human, d.n)}%"></i></span></span><span class="x">${labels}</span></span>`;
  }).join('');
  const picker = windows.length > 1 ? `<span class="chart-window" role="radiogroup" aria-label="Chart window">${windows.map((w) => `<input type="radio" name="chart-window" id="cw-${w.id}" value="${w.id}"${w.id === 'all' ? ' checked' : ''}><label for="cw-${w.id}">${h(w.label)}</label>`).join('')}</span>` : '';
  const notes = windows.map((w) => `<span class="note-${w.id}">${days.length - w.first} days · ${w.total} page views · peak ${w.max} on ${h(shortDay(w.peak.day))}</span>`).join('');
  const peaks = windows.map((w) => `<span class="peak-${w.id}">peak ${w.max}</span>`).join('');
  return `<div class="panel chart-panel"><div class="panel-head"><h3>Page views per day (PT)</h3>${picker}${keys}</div><p class="faint small chart-note">${notes}</p>
<div class="chart${days.length > 60 ? ' dense' : ''}" tabindex="0" role="img" aria-label="Page views per day from ${h(days[0].day)} to ${h(days[days.length - 1].day)}: ${windows[0].total} in total, peak ${windows[0].max} on ${h(windows[0].peak.day)}. Hover a bar for its day; scroll horizontally for long histories."><span class="peak" aria-hidden="true">${peaks}</span><span class="cols">${cols}</span></div></div>`;
}

function overview(v, rangeLabel, days) {
  const human = share(v.human, v.events);
  const automated = v.events ? 100 - human : 0;
  return `<section id="analytics-metrics" class="overview" aria-labelledby="h-metrics">
<div class="panel kpi-panel"><h2 id="h-metrics" class="eyebrow">In view · ${h(rangeLabel)}</h2>
<div class="kpi-main"><div class="stat"><b>${v.events}</b>page views in view</div>
<div class="kpi-split"><div class="split" role="img" aria-label="${v.human} human and ${v.automated} automated page views"><span class="human" style="width:${human}%"></span><span class="automated" style="width:${automated}%"></span></div>
<div class="keys"><span class="key human">${human}% human</span><span class="key automated">${automated}% automated</span></div></div></div>
<div class="kpis">
  <div class="stat"><b>${v.human}</b>human</div>
  <div class="stat"><b>${v.automated}</b>automated</div>
  <div class="stat"><b>${v.native}</b>native</div>
  <div class="stat"><b>${v.legacy}</b>legacy</div>
  <div class="stat" title="Distinct IP addresses in the view — not people"><b>${v.addresses}</b>distinct IPs <span class="muted">(not people)</span></div>
</div></div>
${dailyChart(days)}
</section>`;
}

const dash = '<span class="faint">—</span>';

function paginationControls(f, stream) {
  const { pages, current, total } = stream;
  const last = pages.length;
  const link = (number, label, disabled) => disabled
    ? `<span class="btn secondary" aria-disabled="true">${label}</span>`
    : `<a data-analytics-nav class="btn secondary" href="/analytics${qs(f, { p: number })}">${label}</a>`;
  const base = `/analytics${qs(f)}`;
  const fields = [...new URL(base, 'https://boss.local').searchParams].map(([key, value]) => hidden(key, value)).join('');
  const options = pages.map(p => `<option value="${p.number}"${p.number === current ? ' selected' : ''}>Page ${p.number} · ALL # ${p.firstId}–${p.lastId}</option>`).join('');
  return `<div class="table-foot"><span class="faint small">${total ? `Rows ${(current - 1) * f.limit + 1}–${Math.min(current * f.limit, total)} of ${total} matching · page ${current} of ${last}` : '0 matching records · no pages'}</span>
<nav class="actions" aria-label="Visitor event pages">
${link(1, 'First', current <= 1)}${link(current - 1, 'Previous', current <= 1)}
<form method="get" action="/analytics" data-page-url="${h(base)}" class="actions" id="analytics-pager">${fields}<label for="analytics-page">Page</label><select id="analytics-page" name="p"${last ? '' : ' disabled'}>${options || '<option value="1">No pages</option>'}</select><button class="secondary"${last ? '' : ' disabled'}>Go</button></form>
${link(current + 1, 'Next', current >= last)}${link(last, 'Last', current >= last)}
</nav></div>`;
}

export function renderAnalytics({ identity, flash, f, sum, days = [], tops, streamPage, retention, coverage, corpora, outbox }) {
  const chips = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']]
    .map(([r, l]) => `<a data-analytics-nav${f.range === r ? ' class="on" aria-current="true"' : ''} href="/analytics${qs(f, { range: r, from: '', to: '', before: null, snapshot: null })}">${l}</a>`).join('');
  const o = sum.overall;
  const v = sum.view;
  const retentionLine = retention.overdue
    ? `${retention.overdueRecords} raw records are older than the ${retention.targetDays}-day target (oldest ${h(formatLa(retention.oldestAt))}, ${retention.oldestAgeDays} days). Nothing is deleted automatically.`
    : `No raw record is older than ${retention.targetDays} days${retention.oldestAt ? ` (oldest ${h(formatLa(retention.oldestAt))})` : ''}.`;
  const cols = eventColumns({ ip: { linkable: (r) => validIpAddress(r.ip), href: (r) => ipActivityHref(r.ip, f, streamPage.current) } });
  const rows = streamPage.rows.map((r) => eventRow(cols, r)).join('');
  const rangeLabel = f.range === 'custom' ? `${f.from || '…'} → ${f.to || '…'}` : ({ today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', all: 'all time' })[f.range];
  const headActions = `<nav class="seg" aria-label="Date range">${chips}</nav>`;
  const secondary = [f.origin, f.cls, f.device, f.place, f.referrer, f.browser].filter(Boolean).length + (Number(f.limit) === 50 ? 0 : 1);
  const lede = `Global log · retained ${o.retained} records · today (PT) ${o.today} · oldest ${h(formatLa(o.oldest))} · last ALL # ${h(o.lastAllNo ?? '—')} · all-time page views ${o.allTimePageViews}${o.archivedPageViews ? ` (${o.archivedPageViews} kept only as aggregates since ${h(o.archivedFirstDay)})` : ''}`;
  const body = `
<div id="analytics-retention">${retention.overdue ? `<div class="notice warn" role="note"><span class="lbl warn">Global retention</span><span>${retention.overdueRecords} raw records are past the ${retention.targetDays}-day target. See <a href="#data-ops">Data operations</a>; nothing is deleted automatically.</span></div>` : ''}</div>
${overview(v, rangeLabel, days)}

<section class="section" aria-labelledby="h-filters"><form method="get" action="/analytics" class="filterbar" id="analytics-filters" data-view-url="/analytics${h(qs(f, { p: streamPage.current }))}">${hidden('range', f.range)}
  <div class="panel-head"><h2 id="h-filters">Filters</h2><p class="faint small">Days are Pacific Time · empty fields match everything</p></div>
  <div class="filter-row">
    <div><label for="f-from">From (PT day)</label><input id="f-from" name="from" value="${h(f.from)}" placeholder="YYYY-MM-DD" inputmode="numeric"></div>
    <div><label for="f-to">To (PT day)</label><input id="f-to" name="to" value="${h(f.to)}" placeholder="YYYY-MM-DD" inputmode="numeric"></div>
    <div><label for="f-country">Country contains / code</label><input id="f-country" name="country" value="${h(f.country)}"></div>
    <div><label for="f-ip">IP (exact)</label><input id="f-ip" name="ip" value="${h(f.ip)}"></div>
    <div><label for="f-page">Page (exact, or prefix*)</label><input id="f-page" name="page" value="${h(f.page)}"></div>
    <div class="filter-apply"><button>Apply filters</button><a data-analytics-reset class="btn ghost" href="/analytics">Reset</a></div>
  </div>
  <details class="filter-more"${secondary ? ' open' : ''}><summary>More filters${secondary ? ` <span class="n">· ${secondary} active</span>` : ''}</summary>
  <div class="filter-row">
    <div><label for="f-origin">Source</label>${select('origin', [['', 'all'], ['native', 'native'], ['legacy', 'legacy']], f.origin, ' id="f-origin"')}</div>
    <div><label for="f-class">Class</label>${select('class', [['', 'all'], ['human', 'human'], ['automated', 'automated']], f.cls, ' id="f-class"')}</div>
    <div><label for="f-device">Device</label>${select('device', [['', 'all'], ['mobile', 'mobile'], ['desktop', 'desktop'], ['unknown', 'unknown']], f.device, ' id="f-device"')}</div>
    <div><label for="f-place">City / region contains</label><input id="f-place" name="place" value="${h(f.place)}"></div>
    <div><label for="f-ref">Referrer contains</label><input id="f-ref" name="referrer" value="${h(f.referrer)}"></div>
    <div><label for="f-browser">Browser starts with</label><input id="f-browser" name="browser" value="${h(f.browser)}"></div>
    <div><label for="f-limit">Rows per page</label>${select('limit', [[25, 25], [50, 50], [100, 100]], f.limit, ' id="f-limit"')}</div>
  </div></details>
  <div class="filter-foot">
    <span id="analytics-status" class="faint small" role="status" aria-live="polite"></span>
    <div class="actions small"><span class="faint">Export this view</span><a data-analytics-export class="btn secondary" href="/analytics/export${qs(f, { format: 'csv' })}">CSV</a><a data-analytics-export class="btn secondary" href="/analytics/export${qs(f, { format: 'ndjson' })}">NDJSON</a>
    <span class="faint">All retained</span><a class="btn ghost" href="/analytics/export?format=csv&amp;range=all">CSV</a><a class="btn ghost" href="/analytics/export?format=ndjson&amp;range=all">NDJSON</a></div>
  </div>
</form></section>

<section id="analytics-events" class="section" aria-labelledby="h-events">
<div class="stream-head"><h2 id="h-events">Visitor events</h2><p class="faint small">Newest first · ${streamPage.rows.length} rows on this page · <span class="warn">*</span> approximate time · hover a header for its meaning; Details shows every raw field</p></div>
<div class="table-card"><table class="events-table" role="table" style="${columnStyle(cols)}">${eventHead(cols)}
<tbody role="rowgroup">${rows || '<tr role="row"><td role="cell" class="empty">No records in this view. Widen the date range or reset the filters.</td></tr>'}</tbody></table>
${paginationControls(f, streamPage)}</div>
</section>

<section id="analytics-breakdowns" class="section minor" aria-labelledby="h-breakdowns">
<div class="section-head"><h2 id="h-breakdowns">Breakdowns</h2><p class="faint small">Top values in the same view, by record count.</p></div>
<div class="cols-4">${topCard('Top pages', tops.page)}${topCard('Countries', tops.country)}${topCard('Referrers', tops.referrer)}${topCard('Agents', tops.agent)}</div>
</section>

<section class="section minor" id="data-ops" aria-labelledby="h-ops">
<div class="section-head"><h2 id="h-ops">Data operations</h2><p class="faint small">Imports, retention and deletion — kept apart from browsing on purpose.</p></div>
<div class="cols-2">
<div class="card"><h3>Legacy import &amp; coverage</h3>
<ul>${coverage.map((c) => `<li>${h(c.kind)} ${h(formatLa(c.started_at))}${c.ended_at ? ` → ${h(formatLa(c.ended_at))}` : ''} <span class="muted">${h(c.note)}</span></li>`).join('') || '<li class="muted">No legacy corpus imported yet.</li>'}</ul>
${corpora.length ? `<ul class="small">${corpora.map((c) => `<li><code>${h(c.corpus_id)}</code> · ${c.line_count} lines · sha ${h(c.content_sha256.slice(0, 16))}… · <span class="faint">${h(c.summary_json)}</span></li>`).join('')}</ul>` : ''}
<p class="small">DNDR copies: ${outbox.map((r) => `${h(r.state)} ${r.n}`).join(', ') || '<span class="faint">forwarding not configured</span>'}</p>
<a class="btn secondary" href="/analytics/import">Legacy log import</a></div>
<div class="card"><h3>Global retention status</h3>
<p class="${retention.overdue ? 'warn' : 'muted'}">Retention: ${retentionLine}</p>
<p class="faint small">Target ${retention.targetDays} days. Deletion is manual and always previewed; daily and monthly aggregates are kept.</p></div>
</div>
<div class="card danger-zone"><h2>Delete analytics records before a date</h2>
<p class="muted">Manual only. Removes raw records (address, user agent, path) strictly before 00:00 PT on the chosen day; daily and monthly totals are kept as aggregates. The next screen shows an exact preview and export links — nothing is deleted from this form.</p>
<form method="get" action="/analytics/retention" class="actions"><label for="rt-before" class="muted">Cutoff day (PT)</label><input id="rt-before" name="before" value="${h(retention.suggestedCutoffDay)}" style="max-width:160px"><button class="danger">Preview deletion</button></form></div>
<p class="faint small">Imports, exports and deletions are recorded in <a href="/audit">Audit</a>.</p>
</section><script src="/assets/analytics.js" defer></script>`;
  return page({ title: 'Analytics', active: '/analytics', identity, flash, body, lede, headActions, wide:true });
}

export function renderRetentionPreview({ identity, flash, preview, csrf, opId }) {
  const body = preview.count === 0
    ? `<div class="card"><p>No records before 00:00 PT on ${h(preview.cutoffDay)}. Nothing to delete.</p><a class="btn secondary" href="/analytics">Back to Analytics</a></div>`
    : `<div class="card">
<div class="stats">
  <div class="stat"><b>${preview.count}</b>records to delete</div>
  <div class="stat"><b>${preview.kept}</b>records kept</div>
</div>
<p style="margin-top:12px">Records strictly before <b>00:00 PT, ${h(preview.cutoffDay)}</b> — ALL # ${preview.firstNo}–${preview.lastNo}</p>
<p class="muted">Oldest affected ${h(formatLaSeconds(preview.oldest))} · newest affected ${h(formatLaSeconds(preview.newest))}${preview.oldestKept ? ` · oldest kept ${h(formatLaSeconds(preview.oldestKept))}` : ''}</p>
<p>Export exactly these records first: <a href="/analytics/export?format=csv&amp;cutoff=${h(preview.cutoffDay)}">CSV</a> · <a href="/analytics/export?format=ndjson&amp;cutoff=${h(preview.cutoffDay)}">NDJSON</a></p>
</div>
<form method="post" action="/analytics/retention/delete" class="card danger-zone">
${hidden('csrf', csrf)}${hidden('cutoff', preview.cutoffDay)}${hidden('expected', preview.count)}${hidden('op', opId)}
<h2>Permanent deletion</h2>
<p>This permanently deletes <b>${preview.count}</b> raw records. Type the date <b>${h(preview.cutoffDay)}</b> to confirm. If anything changed since this preview, nothing is deleted.</p>
<div class="actions"><label for="rt-confirm" class="muted">Confirm date</label><input id="rt-confirm" name="confirm" placeholder="${h(preview.cutoffDay)}" style="max-width:160px" autocomplete="off"><button class="danger">Delete ${preview.count} records</button><a class="btn ghost" href="/analytics">Cancel</a></div>
</form>`;
  return page({ title: 'Delete before date — preview', active: '/analytics', identity, flash, body, lede: 'Review the exact records before anything is removed.' });
}

export function renderImport({ identity, flash, csrf, plan }) {
  const planBox = plan ? `<div class="card"><h2>Inventory of the uploaded file</h2>
<p>SHA-256 <code>${h(plan.sha256)}</code></p>
<p>${plan.lineCount} lines · ${h(plan.firstAt ? formatLa(plan.firstAt) : '—')} → ${h(plan.lastAt ? formatLa(plan.lastAt) : '—')}</p>
<p>${Object.entries(plan.summary).map(([k, n]) => `<span class="tag">${h(k)} ${n}</span>`).join('')}</p>
<p class="muted small">To apply, upload the same file again below and type the first 12 characters of this SHA-256. Re-running an import adds nothing.</p></div>` : '';
  const body = `${planBox}
<form method="post" action="/analytics/import" enctype="multipart/form-data" class="card">${hidden('csrf', csrf)}
<div class="grid"><div><label for="im-file">Log file</label><input id="im-file" type="file" name="file" accept=".txt,.ndjson,.log"></div>
<div><label for="im-confirm">Confirm SHA-256 prefix (leave empty for an inventory only)</label><input id="im-confirm" name="confirm" placeholder="first 12 hex characters" autocomplete="off"></div></div>
<div class="form-foot"><div class="actions"><button>Upload</button><a class="btn ghost" href="/analytics#data-ops">Back to Analytics</a></div></div></form>`;
  return page({ title: 'Legacy log import', active: '/analytics', identity, flash, body, lede: 'Imports the Hostinger panel log (aw_panel_log.txt). Lines already stored, lines older than an applied deletion cutoff and lines without a page are recorded in the ledger but not inserted. Addresses and user agents are never shown here.' });
}
