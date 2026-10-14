// Owner-facing analytics time is America/Los_Angeles through the IANA zone, so
// daylight saving follows the zone rules on each date (never a fixed offset).
// Storage is always UTC Unix seconds.

export const OWNER_TZ = 'America/Los_Angeles';

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OWNER_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function laParts(unixSeconds) {
  const parts = {};
  for (const { type, value } of partsFormatter.formatToParts(new Date(unixSeconds * 1000))) parts[type] = value;
  return parts;
}

/** The Los Angeles calendar day (YYYY-MM-DD) of a Unix-seconds instant. */
export function laDay(unixSeconds) {
  const p = laParts(unixSeconds);
  return `${p.year}-${p.month}-${p.day}`;
}

/** True when `value` is a real calendar day written as YYYY-MM-DD. */
export function isDay(value) {
  const match = DAY_PATTERN.exec(String(value ?? ''));
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/**
 * Every UTC instant (Unix seconds) whose Los Angeles wall clock reads exactly
 * `day hh:mm:ss`. Normally one; two in the repeated fall-back hour; none in
 * the skipped spring-forward hour. The zone is UTC-7 or UTC-8, so only those
 * two candidates need checking.
 */
export function wallTimeToInstants(day, hour, minute, second) {
  if (!isDay(day)) return [];
  const base = Date.parse(`${day}T00:00:00Z`) / 1000 + hour * 3600 + minute * 60 + second;
  const out = [];
  for (const offsetHours of [7, 8]) {
    const candidate = base + offsetHours * 3600;
    const p = laParts(candidate);
    if (`${p.year}-${p.month}-${p.day}` === day && Number(p.hour) === hour
      && Number(p.minute) === minute && Number(p.second) === second) out.push(candidate);
  }
  return out.sort((a, b) => a - b);
}

/** Unix seconds of 00:00 in Los Angeles on `day`, or null. */
export function laMidnight(day) {
  const instants = wallTimeToInstants(day, 0, 0, 0);
  return instants.length ? instants[0] : null;
}

/** The day after `day` (calendar arithmetic, zone independent). */
export function nextDay(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** The day `n` days before `day`. */
export function daysBefore(day, n) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

/** [start, end) Unix seconds of one Los Angeles calendar day; 23 or 25 hours on DST days. */
export function laDayBounds(day) {
  const start = laMidnight(day);
  return start === null ? null : { start, end: laMidnight(nextDay(day)) };
}

const minuteFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OWNER_TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
});
const secondFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OWNER_TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
});

function assemble(formatter, unixSeconds) {
  const p = {};
  for (const { type, value } of formatter.formatToParts(new Date(unixSeconds * 1000))) p[type] = value;
  const time = `${p.hour}:${p.minute}${p.second ? `:${p.second}` : ''} ${p.dayPeriod}`;
  return `${p.month} ${p.day}, ${p.year} · ${time} PT`;
}

/** "Oct 14, 2026 · 4:05 AM PT" */
export function formatLa(unixSeconds) {
  if (!Number.isFinite(Number(unixSeconds))) return '—';
  return assemble(minuteFormatter, Number(unixSeconds));
}

/** Same with seconds, for exports and detail views. */
export function formatLaSeconds(unixSeconds) {
  if (!Number.isFinite(Number(unixSeconds))) return '';
  return assemble(secondFormatter, Number(unixSeconds));
}

export function isoUtc(unixSeconds) {
  return new Date(Number(unixSeconds) * 1000).toISOString().replace('.000Z', 'Z');
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
