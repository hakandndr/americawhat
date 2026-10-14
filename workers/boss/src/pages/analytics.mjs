// The single Boss Analytics screen: legacy and native rows together.

import { formatLa, formatLaSeconds, isoUtc } from '../../../shared/time.mjs';
import { h, hidden, page, select } from '../html.mjs';

function qs(f, over = {}) {
  const p = new URLSearchParams();
  const v = { range: f.range, from: f.from, to: f.to, origin: f.origin, class: f.cls, device: f.device, ip: f.ip, country: f.country, place: f.place, page: f.page, referrer: f.referrer, browser: f.browser, limit: f.limit, ...over };
  for (const [k, val] of Object.entries(v)) if (val !== '' && val != null && !(k === 'range' && val === 'all') && !(k === 'limit' && Number(val) === 50)) p.set(k, String(val));
  const s = p.toString();
  return s ? `?${s}` : '';
}

function topTable(title, rows) {
  return `<div class="card"><b>${h(title)}</b><table>${rows.map((r) => `<tr><td class="wrap">${h(r.value || '—')}</td><td>${r.n}</td></tr>`).join('') || '<tr><td class="muted">none</td></tr>'}</table></div>`;
}

export function renderAnalytics({ identity, flash, f, sum, tops, streamPage, retention, coverage, corpora, outbox }) {
  const chips = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']]
    .map(([r, l]) => `<a class="btn${f.range === r ? '' : ' secondary'}" style="${f.range === r ? '' : 'background:transparent;color:inherit;border:1px solid var(--line)'}" href="/analytics${qs(f, { range: r, from: '', to: '', before: null })}">${l}</a>`).join(' ');
  const o = sum.overall;
  const v = sum.view;
  const retentionBox = retention.overdue
    ? `<div class="flash err">Retention: ${retention.overdueRecords} raw records are older than the ${retention.targetDays}-day target (oldest ${h(formatLa(retention.oldestAt))}, ${retention.oldestAgeDays} days). Nothing is deleted automatically.</div>`
    : `<p class="muted">Retention: no raw record is older than ${retention.targetDays} days${retention.oldestAt ? ` (oldest ${h(formatLa(retention.oldestAt))})` : ''}.</p>`;
  const rows = streamPage.rows.map((r) => `<tr>
<td>${r.id}</td><td>${r.today_no}</td><td>${h(r.ip)}</td><td>${r.ip_visits}</td><td>${h(formatLaSeconds(r.occurred_at))}${r.time_quality !== 'exact' ? ` <span class="warn" title="${h(r.time_quality)}">*</span>` : ''}</td>
<td><span class="tag">${h(r.origin)}</span></td><td>${h(r.automation)}</td><td>${h(r.agent || r.source_label)}</td><td>${h(r.country)}</td><td>${h([r.city, r.region].filter(Boolean).join(' / '))}</td>
<td class="wrap">${h(r.page)}</td><td>${h(r.referrer)}</td><td>${h(r.device_class)}</td><td>${h(r.browser)}</td><td>${h(r.os)}</td>
<td><details><summary>more</summary><div class="wrap">path ${h(r.path)}<br>referrer ${h(r.referrer_raw)}<br>agent ${h(r.user_agent)}<br>UTC ${h(isoUtc(r.occurred_at))}<br>id ${h(r.event_uid)}${r.import_corpus_id ? `<br>corpus ${h(r.import_corpus_id)}` : ''}</div></details></td></tr>`).join('');
  const body = `
<p class="muted">Retained ${o.retained} records · today (PT) ${o.today} · oldest ${h(formatLa(o.oldest))} · last ALL # ${h(o.lastAllNo ?? '—')} · all-time page views ${o.allTimePageViews}${o.archivedPageViews ? ` (${o.archivedPageViews} kept only as aggregates since ${h(o.archivedFirstDay)})` : ''}</p>
${retentionBox}
<p>${chips}</p>
<div class="stats">
  <div class="stat"><b>${v.events}</b>page views in view</div>
  <div class="stat"><b>${v.human}</b>human</div>
  <div class="stat"><b>${v.automated}</b>automated</div>
  <div class="stat"><b>${v.native}</b>native</div>
  <div class="stat"><b>${v.legacy}</b>legacy</div>
  <div class="stat"><b>${v.addresses}</b>distinct IP addresses <span class="muted">(not people)</span></div>
</div>
<div class="grid">${topTable('Top pages', tops.page)}${topTable('Countries', tops.country)}${topTable('Referrers', tops.referrer)}${topTable('Agents', tops.agent)}</div>
<form method="get" action="/analytics" class="card"><b>Filters</b>
  <div class="grid">
    <div><label>From (PT day)</label><input name="from" value="${h(f.from)}" placeholder="YYYY-MM-DD"></div>
    <div><label>To (PT day)</label><input name="to" value="${h(f.to)}" placeholder="YYYY-MM-DD"></div>
    <div><label>Source</label>${select('origin', [['', 'all'], ['native', 'native'], ['legacy', 'legacy']], f.origin)}</div>
    <div><label>Class</label>${select('class', [['', 'all'], ['human', 'human'], ['automated', 'automated']], f.cls)}</div>
    <div><label>Device</label>${select('device', [['', 'all'], ['mobile', 'mobile'], ['desktop', 'desktop'], ['unknown', 'unknown']], f.device)}</div>
    <div><label>IP (exact)</label><input name="ip" value="${h(f.ip)}"></div>
    <div><label>Country</label><input name="country" value="${h(f.country)}"></div>
    <div><label>City / region contains</label><input name="place" value="${h(f.place)}"></div>
    <div><label>Page (exact, or prefix*)</label><input name="page" value="${h(f.page)}"></div>
    <div><label>Referrer contains</label><input name="referrer" value="${h(f.referrer)}"></div>
    <div><label>Browser starts with</label><input name="browser" value="${h(f.browser)}"></div>
    <div><label>Rows</label>${select('limit', [[25, 25], [50, 50], [100, 100]], f.limit)}</div>
  </div>
  <p><button>Apply</button> <a href="/analytics">reset</a></p>
</form>
<p>Export this view: <a href="/analytics/export${qs(f, { format: 'csv' })}">CSV</a> · <a href="/analytics/export${qs(f, { format: 'ndjson' })}">NDJSON</a> · all retained: <a href="/analytics/export?format=csv&amp;range=all">CSV</a> · <a href="/analytics/export?format=ndjson&amp;range=all">NDJSON</a></p>
<div class="scroll card"><table><thead><tr><th>ALL #</th><th>TODAY #</th><th>IP ADDRESS</th><th>IP VISITS</th><th>DATE AND TIME (PT)</th><th>SOURCE</th><th>CLASS</th><th>AGENT</th><th>COUNTRY</th><th>CITY / REGION</th><th>PAGE</th><th>REFERRER</th><th>DEVICE</th><th>BROWSER</th><th>OS</th><th>DETAIL</th></tr></thead>
<tbody>${rows || '<tr><td colspan="16" class="muted">No records in this view.</td></tr>'}</tbody></table></div>
<p>${streamPage.nextBefore ? `<a class="btn" href="/analytics${qs(f, { before: streamPage.nextBefore })}">Older →</a>` : '<span class="muted">End of the log for this view.</span>'}</p>
<div class="card"><b>Delete analytics records before a date</b>
<p class="muted">Manual only. Removes raw records (address, user agent, path) strictly before 00:00 PT on the chosen day; daily and monthly totals are kept as aggregates. You will see an exact preview and export links first.</p>
<form method="get" action="/analytics/retention" class="actions"><input name="before" value="${h(retention.suggestedCutoffDay)}" style="max-width:160px"><button class="secondary">Preview</button></form></div>
<div class="card"><b>Coverage and imports</b>
<ul>${coverage.map((c) => `<li>${h(c.kind)} ${h(formatLa(c.started_at))}${c.ended_at ? ` → ${h(formatLa(c.ended_at))}` : ''} <span class="muted">${h(c.note)}</span></li>`).join('') || '<li class="muted">No legacy corpus imported yet.</li>'}</ul>
<ul>${corpora.map((c) => `<li>${h(c.corpus_id)} · ${c.line_count} lines · sha ${h(c.content_sha256.slice(0, 16))}… · ${h(c.summary_json)}</li>`).join('')}</ul>
<p><a href="/analytics/import">Legacy log import</a> · DNDR copies: ${outbox.map((r) => `${h(r.state)} ${r.n}`).join(', ') || 'forwarding not configured'}</p></div>`;
  return page({ title: 'Analytics', active: '/analytics', identity, flash, body });
}

export function renderRetentionPreview({ identity, flash, preview, csrf, opId }) {
  const body = preview.count === 0
    ? `<p>No records before 00:00 PT on ${h(preview.cutoffDay)}. Nothing to delete.</p><p><a href="/analytics">Back</a></p>`
    : `<div class="card">
<p>Records strictly before <b>00:00 PT, ${h(preview.cutoffDay)}</b>: <b>${preview.count}</b> (ALL # ${preview.firstNo}–${preview.lastNo})</p>
<p>Oldest affected ${h(formatLaSeconds(preview.oldest))} · newest affected ${h(formatLaSeconds(preview.newest))}</p>
<p>Kept: ${preview.kept} records${preview.oldestKept ? `, oldest kept ${h(formatLaSeconds(preview.oldestKept))}` : ''}</p>
<p>Export exactly these records first: <a href="/analytics/export?format=csv&amp;cutoff=${h(preview.cutoffDay)}">CSV</a> · <a href="/analytics/export?format=ndjson&amp;cutoff=${h(preview.cutoffDay)}">NDJSON</a></p>
</div>
<form method="post" action="/analytics/retention/delete" class="card">
${hidden('csrf', csrf)}${hidden('cutoff', preview.cutoffDay)}${hidden('expected', preview.count)}${hidden('op', opId)}
<p class="bad">This permanently deletes ${preview.count} raw records. Type the date <b>${h(preview.cutoffDay)}</b> to confirm. If anything changed since this preview, nothing is deleted.</p>
<div class="actions"><input name="confirm" placeholder="${h(preview.cutoffDay)}" style="max-width:160px"><button class="danger">Delete ${preview.count} records</button> <a href="/analytics">cancel</a></div>
</form>`;
  return page({ title: 'Delete before date — preview', active: '/analytics', identity, flash, body });
}

export function renderImport({ identity, flash, csrf, plan }) {
  const planBox = plan ? `<div class="card"><b>Inventory of the uploaded file</b>
<p>SHA-256 <code>${h(plan.sha256)}</code> · ${plan.lineCount} lines · ${h(plan.firstAt ? formatLa(plan.firstAt) : '—')} → ${h(plan.lastAt ? formatLa(plan.lastAt) : '—')}</p>
<p>${Object.entries(plan.summary).map(([k, n]) => `${h(k)} ${n}`).join(' · ')}</p>
<p class="muted">To apply, upload the same file again below and type the first 12 characters of this SHA-256. Re-running an import adds nothing.</p></div>` : '';
  const body = `<p class="muted">Imports the Hostinger panel log (aw_panel_log.txt). Lines already stored, lines older than an applied deletion cutoff and lines without a page are recorded in the ledger but not inserted. Addresses and user agents are never shown here.</p>
${planBox}
<form method="post" action="/analytics/import" enctype="multipart/form-data" class="card">${hidden('csrf', csrf)}
<div class="grid"><div><label>Log file</label><input type="file" name="file" accept=".txt,.ndjson,.log"></div>
<div><label>Confirm SHA-256 prefix (leave empty for an inventory only)</label><input name="confirm" placeholder="first 12 hex characters"></div></div>
<p><button>Upload</button></p></form>`;
  return page({ title: 'Legacy log import', active: '/analytics', identity, flash, body });
}
