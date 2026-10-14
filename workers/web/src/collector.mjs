// First-party page-view collector (native origin).
//
// Source first: the row is stored in AmericaWhat's own ANALYTICS_DB; only a
// newly stored row is (optionally) copied to DNDR afterwards. A DNDR failure
// never affects the stored row or the visitor's response.

import { classifyAgent, legacyDeviceString, normalizePage, osFamily, referrerLabel, splitDevice } from '../../shared/classify.mjs';
import { laDay } from '../../shared/time.mjs';

export const RATE_WINDOW_SECONDS = 600;
export const RATE_MAX_EVENTS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let regionNames = null;
function countryName(code) {
  if (!code || code === 'XX' || code === 'T1') return code === 'T1' ? 'Tor' : '';
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code) || code;
  } catch { return code; }
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

/**
 * Builds a native row from the beacon body and the trusted request.
 * Returns { ok: true, row } or { ok: false, error }.
 */
export function buildNativeEvent({ body, ip, userAgent, cf, now }) {
  const evt = String(body?.evt ?? '');
  if (!UUID.test(evt)) return { ok: false, error: 'bad_event_id' };
  const path = cleanText(body?.path, 512);
  if (!path.startsWith('/') || path.startsWith('//')) return { ok: false, error: 'bad_path' };
  const referrerRaw = cleanText(body?.referrer, 1024);
  const ua = cleanText(userAgent, 1024);
  const { sourceLabel, agent, automation } = classifyAgent(ua);
  const device = legacyDeviceString(ua);
  const { deviceClass, browser } = splitDevice(device);
  const code = typeof cf?.country === 'string' ? cf.country.slice(0, 2) : '';
  return {
    ok: true,
    row: {
      event_uid: `aw:${evt.toLowerCase()}`,
      origin: 'native',
      occurred_at: now,
      la_day: laDay(now),
      received_at: now,
      ip: cleanText(ip, 64),
      country: countryName(code),
      country_code: code,
      region: cleanText(cf?.region, 80),
      city: cleanText(cf?.city, 80),
      path,
      page: normalizePage(path),
      referrer: referrerLabel(referrerRaw),
      referrer_raw: referrerRaw,
      user_agent: ua,
      source_label: sourceLabel,
      device,
      device_class: deviceClass,
      browser,
      os: osFamily(ua),
      agent,
      automation,
    },
  };
}

const COLUMNS = ['event_uid', 'origin', 'occurred_at', 'la_day', 'received_at', 'ip', 'country', 'country_code',
  'region', 'city', 'path', 'page', 'referrer', 'referrer_raw', 'user_agent', 'source_label', 'device',
  'device_class', 'browser', 'os', 'agent', 'automation'];

export function insertEventStatement(db, row, { orIgnore = true } = {}) {
  const cols = [...COLUMNS];
  const values = cols.map((c) => row[c] ?? '');
  if (row.time_quality) { cols.push('time_quality'); values.push(row.time_quality); }
  if (row.import_corpus_id) { cols.push('import_corpus_id', 'import_record_id'); values.push(row.import_corpus_id, row.import_record_id); }
  return db.prepare(
    `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO visitor_events (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  ).bind(...values);
}

/**
 * Stores a native row. Returns 'stored' | 'duplicate' | 'rate_limited'.
 * When `withOutbox` is true a pending DNDR outbox row is written in the same
 * batch, only if the event row itself was newly inserted.
 */
export async function storeNativeEvent(db, row, { withOutbox = false } = {}) {
  const recent = await db.prepare(
    'SELECT COUNT(*) AS n FROM visitor_events WHERE ip = ? AND occurred_at > ?',
  ).bind(row.ip, row.occurred_at - RATE_WINDOW_SECONDS).first();
  if (Number(recent?.n || 0) >= RATE_MAX_EVENTS) return 'rate_limited';
  const statements = [insertEventStatement(db, row)];
  if (withOutbox) {
    statements.push(db.prepare(
      `INSERT OR IGNORE INTO dndr_outbox (event_uid, state, attempts, updated_at)
       SELECT ?, 'pending', 0, ? WHERE changes() = 1`,
    ).bind(row.event_uid, row.received_at));
  }
  const results = await db.batch(statements);
  return Number(results[0]?.meta?.changes || 0) === 1 ? 'stored' : 'duplicate';
}
