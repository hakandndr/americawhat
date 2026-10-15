import {h} from '../html.mjs';
import {formatLaSeconds,isoUtc} from '../../../shared/time.mjs';

/** The PT day on the first line and the clock time under it, with the exact instant in datetime. */
export function eventTime(row) {
  const [day,time='']=formatLaSeconds(row.occurred_at).split(' · ');
  const approx=row.time_quality!=='exact'?` <span class="warn" title="time quality: ${h(row.time_quality)}">*</span>`:'';
  return `<time datetime="${h(isoUtc(row.occurred_at))}">${h(day)}<span class="sub">${h(time)}${approx}</span></time>`;
}

/** Every raw field of one record, disclosed on request; the stream shows only a summary of it. */
export function eventDetails(row) {
  const fields=Object.entries(row).filter(([key])=>key!=='today_no' && key!=='ip_visits');
  return `<details class="event-details"><summary>Details</summary><dl class="event-fields">${fields.map(([key,value])=>`<div><dt>${h(key)}</dt><dd>${h(value ?? '—')}${['occurred_at','received_at'].includes(key) && value ? ` · ${h(isoUtc(value))}` : ''}</dd></div>`).join('')}</dl></details>`;
}
