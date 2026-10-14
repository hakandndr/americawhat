// Reactions, audit and health pages.

import { formatLa } from '../../../shared/time.mjs';
import { h, hidden, page } from '../html.mjs';

export function renderReactions({ identity, flash, rows, imports, csrf, plan, titles }) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const planBox = plan ? `<div class="card"><b>Uploaded snapshot</b>
${plan.ok ? `<p>${h(plan.kind)} · SHA-256 <code>${h(plan.sha256)}</code> · ${plan.keys} items · snapshot total ${plan.snapshotTotal} · would add ${plan.votesAdded} votes</p>
<p class="muted">To apply, upload the same file again and type the first 12 characters of the SHA-256.</p>`
    : `<p class="bad">Refused: ${h(plan.errors.join(', '))}</p>`}</div>` : '';
  const body = `<p class="muted">${total} reactions across ${rows.length} items. Imports only ever add; votes cast here are never overwritten.</p>
${planBox}
<form method="post" action="/reactions/import" enctype="multipart/form-data" class="card">${hidden('csrf', csrf)}
<b>Import aw_votes.json</b> <span class="muted">(first import = baseline; later imports add only the difference since the previous snapshot)</span>
<div class="grid"><div><input type="file" name="file" accept=".json"></div><div><input name="confirm" placeholder="SHA-256 prefix to apply"></div></div>
<p><button>Upload</button> · <a href="/reactions/export.json">Export current counts as aw_votes.json</a></p></form>
<div class="card"><b>Imports</b><table><tr><th>When</th><th>Kind</th><th>SHA-256</th><th>Items</th><th>Added</th><th>By</th></tr>
${imports.map((i) => `<tr><td>${h(formatLa(i.imported_at))}</td><td>${h(i.kind)}</td><td>${h(i.source_sha256.slice(0, 16))}…</td><td>${i.keys_count}</td><td>${i.votes_added}</td><td>${h(i.actor)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">none</td></tr>'}</table></div>
<div class="scroll card"><table><tr><th>Item</th><th>Title</th><th>WAT</th><th>LOL</th><th>SAME</th><th>DEAD</th><th>Total</th></tr>
${rows.map((r) => `<tr><td>${h(r.item_id)}</td><td class="wrap">${h(titles.get(r.item_id) || '(not published)')}</td><td>${r.wat}</td><td>${r.lol}</td><td>${r.same}</td><td>${r.dead}</td><td>${r.total}</td></tr>`).join('')}</table></div>`;
  return page({ title: 'Reactions', active: '/reactions', identity, flash, body });
}

export function renderAudit({ identity, flash, boss, decisions, operator }) {
  const body = `<div class="scroll card"><b>Boss actions</b><table><tr><th>When (PT)</th><th>Who</th><th>Action</th><th>Target</th><th>Outcome</th><th>Commit</th><th>Detail</th></tr>
${boss.map((r) => `<tr><td>${h(formatLa(r.at))}</td><td>${h(r.actor)}</td><td>${h(r.action)}</td><td>${h(r.target)}</td><td>${h(r.outcome)}</td><td>${h((r.commit_sha || '').slice(0, 10))}</td><td class="wrap">${h(r.detail)}</td></tr>`).join('')}</table></div>
<div class="scroll card"><b>Editorial decisions</b><table><tr><th>When</th><th>Decision</th><th>Reason</th><th>Title</th><th>Domain</th><th>Published as</th><th>Commit</th></tr>
${decisions.map((r) => `<tr><td>${h(formatLa(r.decided_at))}</td><td>${h(r.decision)}</td><td>${h(r.reason_code || '')}</td><td class="wrap">${h(r.title)}</td><td>${h(r.source_domain)}</td><td>${h(r.published_id || '')}</td><td>${h((r.commit_sha || '').slice(0, 10))}</td></tr>`).join('')}</table></div>
<div class="scroll card"><b>Analytics operations</b><table><tr><th>When</th><th>Who</th><th>Action</th><th>Cutoff</th><th>Records</th><th>Range</th></tr>
${operator.map((r) => `<tr><td>${h(formatLa(r.at))}</td><td>${h(r.actor)}</td><td>${h(r.action)}</td><td>${h(r.cutoff_day || '')}</td><td>${r.record_count}</td><td>${h(r.oldest_at ? `${formatLa(r.oldest_at)} → ${formatLa(r.newest_at)}` : '')}</td></tr>`).join('')}</table></div>`;
  return page({ title: 'Audit', active: '/audit', identity, flash, body });
}

export function renderHealth({ identity, checks }) {
  const body = `<div class="card"><table>${checks.map((c) => `<tr><td>${h(c.name)}</td><td class="${c.ok ? 'ok' : c.warn ? 'warn' : 'bad'}">${c.ok ? 'ok' : c.warn ? 'warning' : 'problem'}</td><td class="wrap">${h(c.detail || '')}</td></tr>`).join('')}</table></div>
<p class="muted">No secret value is ever displayed.</p>`;
  return page({ title: 'Health', active: '/health', identity, body });
}
