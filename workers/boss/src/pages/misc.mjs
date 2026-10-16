// Reactions, audit and health pages.

import { formatLa } from '../../../shared/time.mjs';
import { h, hidden, page } from '../html.mjs';

const none = (cols, text = 'Nothing recorded yet.') => `<tr><td colspan="${cols}" class="empty">${h(text)}</td></tr>`;

export function renderReactions({ identity, flash, rows, imports, csrf, plan, titles }) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const planBox = plan ? `<div class="card"><h2>Uploaded snapshot</h2>
${plan.ok ? `<p>${h(plan.kind)} · ${plan.keys} items · snapshot total ${plan.snapshotTotal} · would add <b>${plan.votesAdded}</b> votes</p><p>SHA-256 <code>${h(plan.sha256)}</code></p>
<p class="muted small">To apply, upload the same file again and type the first 12 characters of the SHA-256.</p>`
    : `<p class="bad" role="alert">Refused: ${h(plan.errors.join(', '))}</p>`}</div>` : '';
  const body = `
<div class="stats">
  <div class="stat"><b>${total}</b>reactions</div>
  <div class="stat"><b>${rows.length}</b>items with reactions</div>
  <div class="stat"><b>${sum('wat')}</b>WAT</div>
  <div class="stat"><b>${sum('lol')}</b>LOL</div>
  <div class="stat"><b>${sum('same')}</b>SAME</div>
  <div class="stat"><b>${sum('dead')}</b>DEAD</div>
</div>
<section class="section" aria-labelledby="h-counts"><div class="section-head"><h2 id="h-counts">Counts per story</h2></div>
<div class="table-card"><div class="scroll"><table><thead><tr><th scope="col">Item</th><th scope="col">Title</th><th class="num" scope="col">WAT</th><th class="num" scope="col">LOL</th><th class="num" scope="col">SAME</th><th class="num" scope="col">DEAD</th><th class="num" scope="col">Total</th></tr></thead><tbody>
${rows.map((r) => `<tr><td class="mono">${h(r.item_id)}</td><td class="wrap">${titles.has(r.item_id) ? h(titles.get(r.item_id)) : '<span class="faint">(not published)</span>'}</td><td class="num">${r.wat}</td><td class="num">${r.lol}</td><td class="num">${r.same}</td><td class="num">${r.dead}</td><td class="num"><b>${r.total}</b></td></tr>`).join('') || none(7, 'No reactions yet.')}</tbody></table></div></div></section>
<section class="section minor" aria-labelledby="h-imports"><div class="section-head"><h2 id="h-imports">Imports</h2><p class="faint small">First import = baseline; later imports add only the difference since the previous snapshot.</p></div>
${planBox}
<form method="post" action="/reactions/import" enctype="multipart/form-data" class="card">${hidden('csrf', csrf)}
<h3>Import aw_votes.json</h3>
<div class="grid"><div><label for="rx-file">Snapshot file</label><input id="rx-file" type="file" name="file" accept=".json"></div><div><label for="rx-confirm">SHA-256 prefix to apply (empty = plan only)</label><input id="rx-confirm" name="confirm" placeholder="first 12 hex characters" autocomplete="off"></div></div>
<div class="form-foot"><div class="actions"><button>Upload</button></div><a class="btn secondary" href="/reactions/export.json">Export current counts as aw_votes.json</a></div></form>
<div class="table-card"><div class="scroll"><table><thead><tr><th scope="col">When (PT)</th><th scope="col">Kind</th><th scope="col">SHA-256</th><th class="num" scope="col">Items</th><th class="num" scope="col">Added</th><th scope="col">By</th></tr></thead><tbody>
${imports.map((i) => `<tr><td>${h(formatLa(i.imported_at))}</td><td>${h(i.kind)}</td><td class="mono">${h(i.source_sha256.slice(0, 16))}…</td><td class="num">${i.keys_count}</td><td class="num">${i.votes_added}</td><td>${h(i.actor)}</td></tr>`).join('') || none(6, 'No imports yet.')}</tbody></table></div></div></section>`;
  return page({ title: 'Reactions', active: '/reactions', identity, flash, body, lede: `${total} reactions across ${rows.length} items. Imports only ever add; votes cast here are never overwritten.` });
}

export function renderAudit({ identity, flash, boss, decisions, operator }) {
  const outcome = (o) => `<span class="${/^(ok|success|applied|done)/i.test(String(o)) ? 'ok' : /fail|error|refus/i.test(String(o)) ? 'bad' : ''}">${h(o)}</span>`;
  const decision = (d) => `<span class="tag${d === 'approved' || d === 'approve' ? ' ok' : d === 'rejected' || d === 'reject' ? ' warn' : ''}">${h(d)}</span>`;
  const body = `
<section aria-labelledby="h-boss"><div class="section-head"><h2 id="h-boss">Boss actions</h2></div>
<div class="table-card"><div class="scroll"><table><thead><tr><th scope="col">When (PT)</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Outcome</th><th scope="col">Commit</th><th scope="col">Detail</th></tr></thead><tbody>
${boss.map((r) => `<tr><td>${h(formatLa(r.at))}</td><td>${h(r.actor)}</td><td class="mono">${h(r.action)}</td><td>${h(r.target)}</td><td>${outcome(r.outcome)}</td><td class="mono">${h((r.commit_sha || '').slice(0, 10))}</td><td class="wrap">${h(r.detail)}</td></tr>`).join('') || none(7)}</tbody></table></div></div></section>
<section class="section" aria-labelledby="h-dec"><div class="section-head"><h2 id="h-dec">Editorial decisions</h2></div>
<div class="table-card"><div class="scroll"><table><thead><tr><th scope="col">When (PT)</th><th scope="col">Decision</th><th scope="col">Reason</th><th scope="col">Title</th><th scope="col">Domain</th><th scope="col">Published as</th><th scope="col">Commit</th></tr></thead><tbody>
${decisions.map((r) => `<tr><td>${h(formatLa(r.decided_at))}</td><td>${decision(r.decision)}</td><td class="mono">${h(r.reason_code || '')}</td><td class="wrap">${h(r.title)}</td><td>${h(r.source_domain)}</td><td class="mono">${h(r.published_id || '')}</td><td class="mono">${h((r.commit_sha || '').slice(0, 10))}</td></tr>`).join('') || none(7)}</tbody></table></div></div></section>
<section class="section" aria-labelledby="h-op"><div class="section-head"><h2 id="h-op">Analytics operations</h2></div>
<div class="table-card"><div class="scroll"><table><thead><tr><th scope="col">When (PT)</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Cutoff</th><th class="num" scope="col">Records</th><th scope="col">Range</th></tr></thead><tbody>
${operator.map((r) => `<tr><td>${h(formatLa(r.at))}</td><td>${h(r.actor)}</td><td class="mono">${h(r.action)}</td><td>${h(r.cutoff_day || '')}</td><td class="num">${r.record_count}</td><td>${h(r.oldest_at ? `${formatLa(r.oldest_at)} → ${formatLa(r.newest_at)}` : '')}</td></tr>`).join('') || none(6)}</tbody></table></div></div></section>`;
  return page({ title: 'Audit', active: '/audit', identity, flash, body, lede: 'Every Boss write, editorial decision and analytics operation, newest first.' });
}

export function renderHealth({ identity, checks }) {
  const state = (c) => (c.ok ? ['ok', 'ok'] : c.warn ? ['warn', 'warning'] : ['bad', 'problem']);
  const problems = checks.filter((c) => !c.ok && !c.warn).length;
  const warnings = checks.filter((c) => !c.ok && c.warn).length;
  const body = `
<div class="stats">
  <div class="stat"><b>${checks.filter((c) => c.ok).length}</b>ok</div>
  <div class="stat"><b class="${warnings ? 'warn' : ''}">${warnings}</b>warnings</div>
  <div class="stat"><b class="${problems ? 'bad' : ''}">${problems}</b>problems</div>
</div>
<div class="table-card" style="margin-top:14px"><div class="scroll"><table><thead><tr><th scope="col">Check</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead><tbody>
${checks.map((c) => { const [cls, label] = state(c); return `<tr><td>${h(c.name)}</td><td><span class="status ${cls}">${label}</span></td><td class="wrap">${h(c.detail || '')}</td></tr>`; }).join('')}</tbody></table></div></div>
<p class="faint small" style="margin-top:12px">No secret value is ever displayed.</p>`;
  return page({ title: 'Health', active: '/health', identity, body, lede: 'Bindings, configuration and pending work, checked on every load.' });
}
