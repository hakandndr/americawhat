import {formatLaSeconds,isoUtc} from '../../../shared/time.mjs';
import {h,page,hidden} from '../html.mjs';
import {analyticsBack,analyticsQuery} from '../analytics-links.mjs';
import {eventDetails} from './analytics-event.mjs';

export function renderIpActivity({identity,flash,activity,back,limit}) {
  const {address,totals:t,history:s}=activity;
  const backHref=analyticsBack(back);
  const params=new URLSearchParams({address,snapshot:String(s.snapshot),back:backHref,limit:String(limit)});
  const href=p=>{const q=new URLSearchParams(params);q.set('p',String(p));return `/analytics/ip?${q}`;};
  const nav=(p,label,disabled)=>disabled?`<span class="btn secondary" aria-disabled="true">${label}</span>`:`<a class="btn secondary" href="${h(href(p))}">${label}</a>`;
  const rows=s.rows.map(r=>`<tr>
<td class="num" data-label="ALL #">${h(r.id)}</td>
<td data-label="Date and time (PT)"><time datetime="${h(isoUtc(r.occurred_at))}">${h(formatLaSeconds(r.occurred_at))}</time>${r.time_quality!=='exact'?`<span class="sub">${h(r.time_quality)}</span>`:''}</td>
<td data-label="Page · referrer"><span class="clip" title="${h(r.path)}">${h(r.path)}</span><span class="sub clip" title="${h(r.referrer_raw)}">${h(r.referrer || '—')}</span>${eventDetails(r)}</td>
<td data-label="Country · place">${h(r.country || '—')}<span class="sub">${h([r.city,r.region].filter(Boolean).join(' / '))}</span></td>
<td data-label="Source · class · device">${h(r.origin)} · ${h(r.automation)}<span class="sub">${h([r.device_class,r.browser,r.os].filter(Boolean).join(' · '))}</span><span class="sub clip" title="${h(r.agent || r.source_label)}">${h(r.agent || r.source_label)}</span></td></tr>`).join('');
  const exports=analyticsQuery({ip:address,snapshot:s.snapshot,range:'all'},{format:'csv'});
  const body=`<section class="stats" aria-label="Current retained activity for this address">
<div class="stat"><b>${h(t.events)}</b>retained page views <span class="muted">(IP Visits)</span></div>
<div class="stat"><b>${h(t.active_days)}</b>active PT days</div><div class="stat"><b>${h(t.pages)}</b>distinct pages</div>
<div class="stat"><b>${Number(t.human || 0)} / ${Number(t.automated || 0)}</b>human / automated records</div>
</section><div class="card activity-overview"><dl class="kv"><dt>IP address</dt><dd class="mono">${h(address)}</dd><dt>First retained activity (PT)</dt><dd>${t.first_at==null?'—':h(formatLaSeconds(t.first_at))}</dd><dt>Last retained activity (PT)</dt><dd>${t.last_at==null?'—':h(formatLaSeconds(t.last_at))}</dd><dt>Recorded sources</dt><dd>${Number(t.native || 0)} native · ${Number(t.legacy || 0)} legacy</dd></dl></div>
<section class="section" aria-labelledby="h-ip-history"><div class="section-head"><h2 id="h-ip-history">Activity history</h2><p class="faint small">Newest first · ${s.total} retained events at snapshot ALL # ${s.snapshot}. Totals above include all currently retained events; history and exports keep this snapshot.</p></div>
<div class="actions activity-exports"><a class="btn secondary" href="/analytics/export${h(exports)}">CSV</a><a class="btn secondary" href="/analytics/export${h(exports.replace('format=csv','format=ndjson'))}">NDJSON</a></div>
<div class="table-card"><table class="events-table activity-table"><colgroup><col style="width:7%"><col style="width:18%"><col style="width:35%"><col style="width:18%"><col style="width:22%"></colgroup><thead><tr><th scope="col" class="num">ALL #</th><th scope="col">Date and time (PT)</th><th scope="col">Page · referrer · details</th><th scope="col">Country · place</th><th scope="col">Source · class · device</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">No retained events for this address in this snapshot.</td></tr>'}</tbody></table>
<div class="table-foot"><span class="small faint">${s.total?`Page ${s.current} of ${s.pages.length} · ${s.total} events`:'0 matching events'}</span><nav class="actions" aria-label="IP activity pages">${nav(1,'First',s.current<=1)}${nav(s.current-1,'Previous',s.current<=1)}
<form action="/analytics/ip" method="get" class="actions">${[...params].map(([k,v])=>hidden(k,v)).join('')}<label for="ip-page">Page</label><select id="ip-page" name="p"${s.pages.length?'':' disabled'}>${s.pages.map(p=>`<option value="${p.number}"${s.current===p.number?' selected':''}>${p.number}</option>`).join('') || '<option>1</option>'}</select><button class="secondary"${s.pages.length?'':' disabled'}>Go</button></form>
${nav(s.current+1,'Next',s.current>=s.pages.length)}${nav(s.pages.length,'Last',s.current>=s.pages.length)}</nav></div></div></section>`;
  return page({title:`IP activity · ${address}`,active:'/analytics',identity,flash,wide:true,headActions:`<a class="btn secondary" href="${h(backHref)}">Back to Analytics</a>`,lede:'One exact address, not a person or session. Shared networks, proxies and changing addresses affect interpretation. All fields come from retained records; nothing is deleted automatically.',body});
}
