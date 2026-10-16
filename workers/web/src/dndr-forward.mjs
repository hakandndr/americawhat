// Optional, additive copy of a stored native page view to DNDR Analytics.
//
// The contract mirrors the existing DNDR producer binding: a Service Binding
// named DNDR_COLLECTOR whose entrypoint exposes recordPage(event) and returns
// { status: 'accepted' | 'duplicate' | 'rejected' | 'error' }. The producer
// identity is the binding's own props, never chosen here. The event id is the
// stored row's event_uid, so a retry is idempotent on the DNDR side.
//
// Enabling it requires a DNDR-side producer registration, which is outside
// this repository; until then the binding is absent and nothing is sent.

export const FORWARD_ENVIRONMENTS = Object.freeze(['staging', 'production']);
const STATUSES = new Set(['accepted', 'duplicate', 'rejected', 'error']);

export function forwardingEnabled(env) {
  return Boolean(env && env.DNDR_COLLECTOR && typeof env.DNDR_COLLECTOR.recordPage === 'function')
    && FORWARD_ENVIRONMENTS.includes(env.ENVIRONMENT || '');
}

export function dndrPageEvent(row, hostname) {
  return {
    producerEventId: row.event_uid,
    hostname,
    path: row.path,
    referrer: row.referrer_raw || '',
    ip: row.ip,
    userAgent: row.user_agent,
    country: row.country_code || '',
    region: row.region || '',
    city: row.city || '',
  };
}

/** Sends one event and records the outcome in the outbox. Never throws. */
export async function forwardAndRecord(env, db, event, now) {
  let status = 'error';
  let reason = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await env.DNDR_COLLECTOR.recordPage(event);
      status = result && STATUSES.has(result.status) ? result.status : 'error';
      reason = result && result.reason ? String(result.reason).slice(0, 120) : '';
      if (status !== 'error') break;
    } catch (error) {
      status = 'error';
      reason = (error instanceof Error ? error.message : String(error)).slice(0, 120);
    }
  }
  const state = status === 'accepted' || status === 'duplicate' ? 'sent' : 'failed';
  try {
    await db.prepare(
      'UPDATE dndr_outbox SET state = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE event_uid = ?',
    ).bind(state, state === 'sent' ? '' : `${status}${reason ? `: ${reason}` : ''}`, now, event.producerEventId).run();
  } catch { /* the source row is already stored; the outbox stays pending */ }
  return status;
}
