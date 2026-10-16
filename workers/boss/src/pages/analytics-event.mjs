import {h} from '../html.mjs';
import {formatLaSeconds,isoUtc} from '../../../shared/time.mjs';

// The event stream (Analytics) and the exact-address history (IP activity)
// share one column list: one compact row per event, full values in titles and
// in Details. Each column's width feeds the row grid; columns marked `drop`
// leave the row at narrower desktop widths (their values stay in Details) and
// come back in the labelled cards used on small screens. `wrap` columns
// (PAGE) break long values over several lines instead of truncating them.

export const ALL_TIP='ALL #: permanent database ID of this event. Never reset, reused or renumbered by filters; gaps are deleted records.';
export const DAY_TIP='DAY #: position in time order among all retained events of the same Pacific Time day (1 = first event), shown with the day total. Filters never change it.';
const VISITS_TIP='Retained page views from this exact address, all dates and sources, up to the last ALL # of this list. Events, not people or sessions.';

const dash='<span class="faint">—</span>';
const text=(value,title=value)=>value==null||value===''?dash:`<span title="${h(title)}">${h(value)}</span>`;

function when(row) {
  const [day,time='']=formatLaSeconds(row.occurred_at).split(' · ');
  const approx=row.time_quality!=='exact'?` <span class="warn" title="time quality: ${h(row.time_quality)}">*</span>`:'';
  return `<time datetime="${h(isoUtc(row.occurred_at))}" title="${h(day)} · ${h(time)} · ${h(isoUtc(row.occurred_at))}">${h(day.replace(/, \d{4}$/,''))} · ${h(time.replace(/ PT$/,''))}</time>${approx}`;
}

/** Country code and city on the first line, country name and region under it; full value in the title. */
function place(r) {
  const city=r.city||r.region||'';
  const region=r.region&&r.city&&!r.city.includes(r.region)?r.region:'';
  if(!r.country&&!city) return dash;
  const full=[r.country,r.country_code,r.region,r.city].filter(Boolean).join(' · ');
  const first=r.country_code?`<b class="cc">${h(r.country_code)}</b>${city?` ${h(city)}`:''}`:h(city||r.country);
  const second=[city||r.country_code?r.country:'',region].filter(Boolean).join(' · ');
  return `<span class="two" title="${h(full)}"><span>${first}</span><span class="sub">${h(second||' ')}</span></span>`;
}

/** Column list for one table. `ip` is { href(row), linkable(row) } on the Analytics stream, absent on IP activity. */
export function eventColumns({ip}={}) {
  const cols=[
    {key:'all',label:'ALL #',tip:ALL_TIP,w:'48px',num:true,cell:(r)=>`<span title="${h(ALL_TIP)}">${h(r.id)}</span>`},
    {key:'day',label:'DAY #',tip:DAY_TIP,w:'52px',num:true,cell:(r)=>r.today_no>0?`<span title="Event ${h(r.today_no)} of ${h(r.day_total)} on ${h(r.la_day)} (PT), in time order over every retained event that day">${h(r.today_no)}<span class="of">/${h(r.day_total)}</span></span>`:dash},
    {key:'time',label:'DATE / TIME (PT)',w:'118px',cell:when},
  ];
  if (ip) cols.push(
    {key:'ip',label:'IP ADDRESS',w:'108px',cell:(r)=>ip.linkable(r)?`<a class="ip-link mono" href="${h(ip.href(r))}" title="${h(r.ip)} — open activity">${h(r.ip)}</a>`:`<span class="mono" title="${h(r.ip||'')}">${h(r.ip||'—')}</span>`},
    {key:'visits',label:'IP VISITS',tip:VISITS_TIP,w:'52px',num:true,cell:(r)=>ip.linkable(r)?`<a class="ip-link" href="${h(ip.href(r))}" title="${h(VISITS_TIP)}" aria-label="${h(r.ip_visits)} retained page views for ${h(r.ip)}">${h(r.ip_visits)}</a>`:h(r.ip_visits)},
  );
  cols.push(
    {key:'source',label:'SOURCE',tip:'Which writer stored the row: native (this site) or legacy (imported Hostinger log).',w:'54px',cell:(r)=>`<span class="src ${r.origin==='legacy'?'legacy':'native'}">${h(r.origin)}</span>`},
    {key:'event',label:'EVENT',w:'60px',drop:'lg',cell:(r)=>text(r.event)},
    {key:'actor',label:'ACTOR',tip:'Class stored at ingestion: human or automated. Never rewritten.',w:'72px',cell:(r)=>`<span class="actor ${r.automation==='human'?'human':'auto'}">${h(r.automation)}</span>`},
    {key:'agent',label:'AGENT',tip:'Agent family from the user agent, or the legacy crawler label. Not verified.',w:'minmax(60px,.4fr)',drop:'md',cell:(r)=>text(r.agent||r.source_label)},
    {key:'place',label:'COUNTRY · CITY',w:'minmax(130px,1fr)',cell:place},
    {key:'page',label:'PAGE',w:'minmax(150px,2fr)',wide:true,wrap:true,cell:(r)=>text(r.page??r.path,r.path&&r.path!==r.page?`${r.page} (path ${r.path})`:r.page)},
    {key:'referrer',label:'REFERRER',w:'minmax(120px,1.1fr)',drop:'md',cell:(r)=>text(r.referrer||'—',r.referrer_raw||r.referrer)},
    {key:'device',label:'DEVICE',w:'56px',drop:'lg',cell:(r)=>text(r.device_class)},
    {key:'browser',label:'BROWSER · OS',w:'minmax(96px,.7fr)',cell:(r)=>{const v=[r.browser,r.os].filter(Boolean).join(' · ');return v?`<span title="${h(r.user_agent||v)}">${h(v)}</span>`:dash;}},
    {key:'more',label:'<span class="visually-hidden">DETAILS</span>',w:'60px',cell:eventDetails},
  );
  return cols;
}

/** The table's grid templates per width tier, set on the table as custom properties. */
export function columnStyle(cols) {
  const tier=(hidden)=>cols.filter((c)=>!hidden.includes(c.drop)).map((c)=>c.w).join(' ');
  return `--cols-xl:${tier([])};--cols-lg:${tier(['lg'])};--cols-md:${tier(['lg','md'])}`;
}

const cellClass=(c)=>[`c-${c.key}`,c.num&&'num',c.wide&&'wide',c.key==='more'&&'more',c.wrap&&'wrap',c.drop&&`hide-${c.drop}`].filter(Boolean).join(' ');

export function eventHead(cols) {
  return `<thead role="rowgroup"><tr role="row">${cols.map((c)=>`<th role="columnheader" scope="col" class="${cellClass(c)}"${c.tip?` title="${h(c.tip)}"`:''}>${c.label}</th>`).join('')}</tr></thead>`;
}

export function eventRow(cols,row) {
  return `<tr role="row">${cols.map((c)=>`<td role="cell" class="${cellClass(c)}" data-label="${h(c.label.replace(/<[^>]+>/g,''))}">${c.cell(row)}</td>`).join('')}</tr>`;
}

/** Every raw field of one record, disclosed on request; the stream shows only a summary of it. */
export function eventDetails(row) {
  const fields=Object.entries(row).filter(([key])=>!['today_no','day_total','ip_visits'].includes(key));
  return `<details class="event-details"><summary>Details</summary><dl class="event-fields">${fields.map(([key,value])=>`<div><dt>${h(key)}</dt><dd>${h(value ?? '—')}${['occurred_at','received_at'].includes(key) && value ? ` · ${h(isoUtc(value))}` : ''}</dd></div>`).join('')}</dl></details>`;
}
