// Optional, additive copy of a stored native page view to DNDR Analytics.
//
// The contract mirrors the existing DNDR producer binding: a Service Binding
// named DNDR_COLLECTOR whose entrypoint exposes recordPage(event) and returns
// { status: 'accepted' | 'duplicate' | 'rejected' | 'error' }. The producer
// identity is the binding's own props, never chosen here. The event id is the
// stored row's event_uid, so a retry is idempotent on the DNDR side.
//
// Only production forwards: staging and local previews never send visitor
// data, even when a binding is present. The production binding names the
// DNDR producer prd_americawhat_native (site_americawhat), which must be
// registered on the DNDR side before events are accepted.
//
// DNDR stamps a PAGE event at the time it receives it, so a retry is only
// meaningful shortly after the visit: retryOutbox() resends pending or
// failed rows inside RETRY_WINDOW_SECONDS and leaves older ones for an
// explicit, reviewed reconciliation instead of mis-dating them.

export const FORWARD_ENVIRONMENTS = Object.freeze(['production']);
export const DNDR_PRODUCER_ID = 'prd_americawhat_native';
export const RETRY_WINDOW_SECONDS = 6 * 3600;
export const RETRY_MAX_ATTEMPTS = 6;
export const RETRY_BATCH = 50;
// A row this fresh may still be in flight from the request's own waitUntil.
export const RETRY_MIN_AGE_SECONDS = 120;
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

/**
 * Outbox recovery (cron): resends pending or failed rows of recent native
 * events in one bounded batch, oldest first. Idempotent: DNDR deduplicates
 * on (producer, event_uid), and a row that reached DNDR is marked sent.
 * Returns the number of rows attempted. Never throws.
 */
export async function retryOutbox(env, db, now, hostname) {
  if (!forwardingEnabled(env)) return 0;
  let rows = [];
  try {
    rows = (await db.prepare(
      `SELECT v.event_uid, v.path, v.referrer_raw, v.ip, v.user_agent, v.country_code, v.region, v.city
         FROM dndr_outbox o JOIN visitor_events v ON v.event_uid = o.event_uid
        WHERE o.state IN ('pending', 'failed') AND o.attempts < ? AND o.updated_at <= ?
          AND v.origin = 'native' AND v.occurred_at >= ?
        ORDER BY v.occurred_at ASC LIMIT ?`,
    ).bind(RETRY_MAX_ATTEMPTS, now - RETRY_MIN_AGE_SECONDS, now - RETRY_WINDOW_SECONDS, RETRY_BATCH).all()).results || [];
  } catch { return 0; }
  for (const row of rows) await forwardAndRecord(env, db, dndrPageEvent(row, hostname), now);
  return rows.length;
}
