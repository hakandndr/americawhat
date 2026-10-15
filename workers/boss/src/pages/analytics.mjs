// The single Boss Analytics screen: legacy and native rows together.
// Order of the page: headline metrics, filters and exports, the raw event
// table (the primary view), breakdowns, then data operations.

import { formatLa, formatLaSeconds, isoUtc } from '../../../shared/time.mjs';
import { bars, h, hidden, page, select } from '../html.mjs';

function qs(f, over = {}) {
  const p = new URLSearchParams();
  const v = { range: f.range, from: f.from, to: f.to, origin: f.origin, class: f.cls, device: f.device, ip: f.ip, country: f.country, place: f.place, page: f.page, referrer: f.referrer, browser: f.browser, limit: f.limit, snapshot: f.snapshot, ...over };
  for (const [k, val] of Object.entries(v)) if (val !== '' && val != null && !(k === 'range' && val === 'all') && !(k === 'limit' && Number(val) === 50)) p.set(k, String(val));
  const s = p.toString();
  return s ? `?${s}` : '';
}

function topCard(title, rows) {
  return `<div class="card"><h3>${h(title)}</h3>${bars(rows)}</div>`;
}

function dailyChart(days) {
  if (!days.length) return '';
  const max = Math.max(...days.map((d) => d.n), 1);
  const cols = days.map((d) => `<span style="height:${Math.max(2, Math.round((d.n / max) * 100))}%" title="${h(d.day)}: ${d.n} records, ${d.human} human"></span>`).join('');
  return `<div class="card"><h3>Records per day (PT)</h3><p class="faint small">Same filters as the table · ${days.length} days with records · peak ${max}. Hover a bar for its day.</p>
<div class="chart" role="img" aria-label="Records per day from ${h(days[0].day)} to ${h(days[days.length - 1].day)}, peak ${max}">${cols}</div><div class="chart-axis"><span>${h(days[0].day)}</span><span>${h(days[days.length - 1].day)}</span></div></div>`;
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

function eventRow(r) {
  const place = [r.city, r.region].filter(Boolean).join(' / ');
  const agent = r.agent || r.source_label;
  const client = [r.browser, r.os].filter(Boolean).join(' · ');
  return `<tr>
<td class="num">${r.id}</td><td class="num">${r.today_no}</td>
<td>${h(formatLaSeconds(r.occurred_at))}${r.time_quality !== 'exact' ? ` <span class="warn" title="time quality: ${h(r.time_quality)}">*</span>` : ''}</td>
<td class="mono">${h(r.ip)}</td><td class="num">${r.ip_visits}</td>
<td><span class="tag${r.origin === 'native' ? ' info' : ''}">${h(r.origin)}</span></td>
<td>${r.automation === 'human' ? 'human' : `<span class="warn">${h(r.automation)}</span>`}${agent ? `<span class="sub clip" title="${h(agent)}">${h(agent)}</span>` : ''}</td>
<td>${r.country ? h(r.country) : dash}${place ? `<span class="sub clip" title="${h(place)}">${h(place)}</span>` : ''}</td>
<td><span class="clip" title="${h(r.page)}">${h(r.page)}</span></td>
<td>${r.referrer ? `<span class="clip" title="${h(r.referrer)}">${h(r.referrer)}</span>` : dash}</td>
<td>${h(r.device_class)}${client ? `<span class="sub">${h(client)}</span>` : ''}</td>
<td><details><summary>more</summary><dl class="kv"><dt>path</dt><dd>${h(r.path)}</dd><dt>referrer</dt><dd>${h(r.referrer_raw)}</dd><dt>agent</dt><dd>${h(r.user_agent)}</dd><dt>UTC</dt><dd>${h(isoUtc(r.occurred_at))}</dd><dt>id</dt><dd>${h(r.event_uid)}</dd>${r.import_corpus_id ? `<dt>corpus</dt><dd>${h(r.import_corpus_id)}</dd>` : ''}</dl></details></td></tr>`;
}

export function renderAnalytics({ identity, flash, f, sum, days = [], tops, streamPage, retention, coverage, corpora, outbox }) {
  const chips = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']]
    .map(([r, l]) => `<a data-analytics-nav${f.range === r ? ' class="on" aria-current="true"' : ''} href="/analytics${qs(f, { range: r, from: '', to: '', before: null, snapshot: null })}">${l}</a>`).join('');
  const o = sum.overall;
  const v = sum.view;
  const retentionLine = retention.overdue
    ? `${retention.overdueRecords} raw records are older than the ${retention.targetDays}-day target (oldest ${h(formatLa(retention.oldestAt))}, ${retention.oldestAgeDays} days). Nothing is deleted automatically.`
    : `No raw record is older than ${retention.targetDays} days${retention.oldestAt ? ` (oldest ${h(formatLa(retention.oldestAt))})` : ''}.`;
  const rows = streamPage.rows.map(eventRow).join('');
  const rangeLabel = f.range === 'custom' ? `${f.from || '…'} → ${f.to || '…'}` : ({ today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', all: 'all time' })[f.range];
  const headActions = `<nav class="seg" aria-label="Date range">${chips}</nav>`;
  const lede = `Global log · retained ${o.retained} records · today (PT) ${o.today} · oldest ${h(formatLa(o.oldest))} · last ALL # ${h(o.lastAllNo ?? '—')} · all-time page views ${o.allTimePageViews}${o.archivedPageViews ? ` (${o.archivedPageViews} kept only as aggregates since ${h(o.archivedFirstDay)})` : ''}`;
  const body = `
<div id="analytics-retention">${retention.overdue ? `<div class="notice warn" role="note"><span class="lbl warn">Global retention</span><span>${retention.overdueRecords} raw records are past the ${retention.targetDays}-day target. See <a href="#data-ops">Data operations</a>; nothing is deleted automatically.</span></div>` : ''}</div>
<section id="analytics-metrics" aria-labelledby="h-metrics"><h2 id="h-metrics" class="eyebrow">In view · ${h(rangeLabel)}</h2>
<div class="stats">
  <div class="stat"><b>${v.events}</b>page views in view</div>
  <div class="stat"><b>${v.human}</b>human</div>
  <div class="stat"><b>${v.automated}</b>automated</div>
  <div class="stat"><b>${v.native}</b>native</div>
  <div class="stat"><b>${v.legacy}</b>legacy</div>
  <div class="stat"><b>${v.addresses}</b>distinct IP addresses <span class="muted">(not people)</span></div>
</div></section>

<section class="section" aria-labelledby="h-filters"><form method="get" action="/analytics" class="card" id="analytics-filters" data-view-url="/analytics${h(qs(f, { p: streamPage.current }))}">${hidden('range', f.range)}
  <div class="section-head"><h2 id="h-filters">Filters</h2><p class="faint small">Days are Pacific Time. Empty fields match everything.</p></div>
  <div class="filters">
    <fieldset><legend>When &amp; source</legend><div class="grid">
      <div><label for="f-from">From (PT day)</label><input id="f-from" name="from" value="${h(f.from)}" placeholder="YYYY-MM-DD" inputmode="numeric"></div>
      <div><label for="f-to">To (PT day)</label><input id="f-to" name="to" value="${h(f.to)}" placeholder="YYYY-MM-DD" inputmode="numeric"></div>
      <div><label for="f-origin">Source</label>${select('origin', [['', 'all'], ['native', 'native'], ['legacy', 'legacy']], f.origin, ' id="f-origin"')}</div>
      <div><label for="f-class">Class</label>${select('class', [['', 'all'], ['human', 'human'], ['automated', 'automated']], f.cls, ' id="f-class"')}</div>
    </div></fieldset>
    <fieldset><legend>Visitor</legend><div class="grid">
      <div><label for="f-ip">IP (exact)</label><input id="f-ip" name="ip" value="${h(f.ip)}"></div>
      <div><label for="f-country">Country contains / code</label><input id="f-country" name="country" value="${h(f.country)}"></div>
      <div><label for="f-place">City / region contains</label><input id="f-place" name="place" value="${h(f.place)}"></div>
      <div><label for="f-device">Device</label>${select('device', [['', 'all'], ['mobile', 'mobile'], ['desktop', 'desktop'], ['unknown', 'unknown']], f.device, ' id="f-device"')}</div>
    </div></fieldset>
    <fieldset><legend>Content &amp; client</legend><div class="grid">
      <div><label for="f-page">Page (exact, or prefix*)</label><input id="f-page" name="page" value="${h(f.page)}"></div>
      <div><label for="f-ref">Referrer contains</label><input id="f-ref" name="referrer" value="${h(f.referrer)}"></div>
      <div><label for="f-browser">Browser starts with</label><input id="f-browser" name="browser" value="${h(f.browser)}"></div>
      <div><label for="f-limit">Rows per page</label>${select('limit', [[25, 25], [50, 50], [100, 100]], f.limit, ' id="f-limit"')}</div>
    </div></fieldset>
  </div>
  <div class="form-foot">
    <div class="actions"><button>Apply filters</button><a data-analytics-reset class="btn ghost" href="/analytics">Reset</a><span id="analytics-status" class="faint small" role="status" aria-live="polite"></span></div>
    <div class="actions small"><span class="faint">Export this view</span><a data-analytics-export class="btn secondary" href="/analytics/export${qs(f, { format: 'csv' })}">CSV</a><a data-analytics-export class="btn secondary" href="/analytics/export${qs(f, { format: 'ndjson' })}">NDJSON</a>
    <span class="faint">All retained</span><a class="btn ghost" href="/analytics/export?format=csv&amp;range=all">CSV</a><a class="btn ghost" href="/analytics/export?format=ndjson&amp;range=all">NDJSON</a></div>
  </div>
</form></section>

<section id="analytics-events" class="section" aria-labelledby="h-events">
<div class="section-head"><h2 id="h-events">Visitor events</h2><p class="faint small">Newest first · ${streamPage.rows.length} rows on this page · ALL # is durable and never renumbered · <span class="warn">*</span> approximate time</p></div>
<div class="table-card"><div class="scroll"><table><thead><tr><th class="num" scope="col">ALL #</th><th class="num" scope="col">TODAY #</th><th scope="col">DATE AND TIME (PT)</th><th scope="col">IP ADDRESS</th><th class="num" scope="col">IP VISITS</th><th scope="col">SOURCE</th><th scope="col">CLASS · AGENT</th><th scope="col">COUNTRY · CITY / REGION</th><th scope="col">PAGE</th><th scope="col">REFERRER</th><th scope="col">DEVICE · BROWSER · OS</th><th scope="col">DETAIL</th></tr></thead>
<tbody>${rows || '<tr><td colspan="12" class="empty">No records in this view. Widen the date range or reset the filters.</td></tr>'}</tbody></table></div>
${paginationControls(f, streamPage)}</div>
</section>

<section id="analytics-breakdowns" class="section minor" aria-labelledby="h-breakdowns">
<div class="section-head"><h2 id="h-breakdowns">Breakdowns</h2><p class="faint small">Top values in the same view, by record count.</p></div>
${dailyChart(days)}
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
  return page({ title: 'Analytics', active: '/analytics', identity, flash, body, lede, headActions });
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
