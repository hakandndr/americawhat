import {h} from '../html.mjs';
import {formatLaSeconds,isoUtc} from '../../../shared/time.mjs';

// Shared cells of the event stream (Analytics) and the exact-address history
// (IP activity). Every value is escaped; full values stay in title attributes
// and in Details.

export const GLOBAL_TIP='Global #: permanent database ID of this event. Never reused or renumbered; gaps are deleted records.';
export const DAY_TIP='Day #: place of this event in time order among all retained events of its Pacific Time day (1 = first event of the day). Filters never change it.';

const dash='<span class="faint">—</span>';

/** Global # and Day # as two cells. */
export function numberCells(row) {
  const day=Number.isFinite(row.today_no)&&row.today_no>0;
  return `<td role="cell" class="num" data-label="Global #" title="${h(GLOBAL_TIP)}">${h(row.id)}</td>
<td role="cell" class="num" data-label="Day #"${day?` title="Event ${h(row.today_no)} of ${h(row.day_total)} on ${h(row.la_day)} (PT), in time order, counting every retained event that day"`:''}>${day?`${h(row.today_no)}<span class="sub">of ${h(row.day_total)}</span>`:dash}</td>`;
}

/** The PT day on the first line and the clock time under it, with the exact instant in datetime. */
export function eventTime(row) {
  const [day,time='']=formatLaSeconds(row.occurred_at).split(' · ');
  const approx=row.time_quality!=='exact'?` <span class="warn" title="time quality: ${h(row.time_quality)}">*</span>`:'';
  return `<time datetime="${h(isoUtc(row.occurred_at))}" title="${h(isoUtc(row.occurred_at))} UTC">${h(day)}<span class="sub">${h(time)}${approx}</span></time>`;
}

export function placeCell(row) {
  const place=[row.city,row.region].filter(Boolean).join(', ');
  const country=row.country?`${h(row.country)}${row.country_code?` <span class="faint">${h(row.country_code)}</span>`:''}`:dash;
  return `<td role="cell" data-label="Location">${country}${place?`<span class="sub clip" title="${h(place)}">${h(place)}</span>`:''}</td>`;
}

export function pageCell(row, path=row.page) {
  const ref=row.referrer_raw||row.referrer;
  return `<td role="cell" class="wide" data-label="Page · referrer"><span class="lines-2" title="${h(path)}">${h(path)}</span><span class="sub clip" title="${h(ref||'')}">${row.referrer_raw?`${h(row.referrer)} · <span class="mono">${h(row.referrer_raw)}</span>`:h(row.referrer||'—')}</span></td>`;
}

export function clientCell(row) {
  const client=[row.browser,row.os].filter(Boolean).join(' · ');
  return `<td role="cell" data-label="Browser · OS · device"><span class="clip" title="${h(row.user_agent||client)}">${h(client||'—')}</span><span class="sub">${h(row.device_class||'—')}</span></td>`;
}

export function classCell(row) {
  const agent=row.agent||row.source_label;
  return `<td role="cell" data-label="Class · source · agent"><span class="cls${row.automation==='human'?' human':''}">${h(row.automation)}</span><span class="cls">${h(row.origin)}</span>${row.event&&row.event!=='page_view'?`<span class="cls">${h(row.event)}</span>`:''}${agent?`<span class="sub clip" title="${h(agent)}">${h(agent)}</span>`:''}</td>`;
}

/** Every raw field of one record, disclosed on request; the stream shows only a summary of it. */
export function eventDetails(row) {
  const fields=Object.entries(row).filter(([key])=>!['today_no','day_total','ip_visits'].includes(key));
  return `<details class="event-details"><summary>Details</summary><dl class="event-fields">${fields.map(([key,value])=>`<div><dt>${h(key)}</dt><dd>${h(value ?? '—')}${['occurred_at','received_at'].includes(key) && value ? ` · ${h(isoUtc(value))}` : ''}</dd></div>`).join('')}</dl></details>`;
}
