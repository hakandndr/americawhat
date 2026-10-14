// CSV and NDJSON exports of analytics rows, streamed in keyset chunks.
//
// CSV: every cell quoted, quotes doubled, NUL removed; a cell starting with
// =, +, -, @, tab or CR gets a leading apostrophe so a spreadsheet does not
// evaluate it (a lone "-" placeholder is kept). NDJSON carries the exact
// stored values for forensic use.

import { formatLaSeconds, isoUtc } from '../../shared/time.mjs';
import { iterateRows } from './analytics-db.mjs';

export const EXPORT_COLUMNS = Object.freeze(['all_no', 'time_pt', 'time_utc', 'occurred_at', 'origin', 'event', 'time_quality', 'ip', 'country',
  'country_code', 'region', 'city', 'page', 'path', 'referrer', 'referrer_raw', 'automation', 'source_label', 'agent', 'device', 'device_class',
  'browser', 'os', 'user_agent', 'event_uid', 'import_corpus_id']);

export function csvCell(value) {
  let s = value == null ? '' : String(value);
  s = s.replace(/\u0000/g, '');
  if (s !== '-' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportRecord(row) {
  return {
    all_no: row.id,
    time_pt: formatLaSeconds(row.occurred_at),
    time_utc: isoUtc(row.occurred_at),
    occurred_at: row.occurred_at,
    origin: row.origin,
    event: row.event,
    time_quality: row.time_quality,
    ip: row.ip,
    country: row.country,
    country_code: row.country_code,
    region: row.region,
    city: row.city,
    page: row.page,
    path: row.path,
    referrer: row.referrer,
    referrer_raw: row.referrer_raw,
    automation: row.automation,
    source_label: row.source_label,
    agent: row.agent,
    device: row.device,
    device_class: row.device_class,
    browser: row.browser,
    os: row.os,
    user_agent: row.user_agent,
    event_uid: row.event_uid,
    import_corpus_id: row.import_corpus_id || '',
  };
}

/** A streaming Response with the export. `scope` = { filters } or { cutoffAt }. */
export function exportResponse(db, format, scope, filename) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        if (format === 'csv') controller.enqueue(encoder.encode(`${EXPORT_COLUMNS.map(csvCell).join(',')}\r\n`));
        for await (const row of iterateRows(db, scope.filters || {}, { cutoffAt: scope.cutoffAt ?? null })) {
          const rec = exportRecord(row);
          const line = format === 'csv' ? `${EXPORT_COLUMNS.map((c) => csvCell(rec[c])).join(',')}\r\n` : `${JSON.stringify(rec)}\n`;
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
