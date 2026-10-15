import {h} from '../html.mjs';
import {isoUtc} from '../../../shared/time.mjs';

export function eventDetails(row) {
  const fields=Object.entries(row).filter(([key])=>key!=='today_no' && key!=='ip_visits');
  return `<details class="event-details"><summary>Details</summary><dl class="event-fields">${fields.map(([key,value])=>`<dt>${h(key)}</dt><dd>${h(value ?? '—')}${['occurred_at','received_at'].includes(key) && value ? ` · ${h(isoUtc(value))}` : ''}</dd>`).join('')}</dl></details>`;
}
