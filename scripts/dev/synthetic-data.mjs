// Synthetic data for the local Boss preview. Every address is from the
// documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24); no
// real visitor, vote or log line is used.

import { importStatements, planCorpus, renderSql } from '../../workers/shared/legacy-import.mjs';
import { classifyAgent, legacyDeviceString, normalizePage, osFamily, splitDevice } from '../../workers/shared/classify.mjs';
import { laDay } from '../../workers/shared/time.mjs';

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
];
const PLACES = [['United States', 'Los Angeles, California', 'US'], ['United States', 'Tampa, Florida', 'US'], ['United States', 'Austin, Texas', 'US'], ['Canada', 'Toronto, Ontario', 'CA'], ['Germany', 'Berlin, Berlin', 'DE']];
const REFERRERS = [['Direct', ''], ['Google', 'https://www.google.com/'], ['Facebook', 'https://m.facebook.com/'], ['Reddit', 'https://www.reddit.com/r/nottheonion/']];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function ip(r) {
  const nets = ['192.0.2', '198.51.100', '203.0.113'];
  return `${nets[Math.floor(r() * 3)]}.${1 + Math.floor(r() * 60)}`;
}

function wall(unixSeconds) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    .formatToParts(new Date(unixSeconds * 1000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.dayPeriod}`;
}

/** A synthetic Hostinger-style panel log covering `days` days up to `endAt`. */
export function syntheticPanelLog({ pages, endAt, days = 130, perDay = 6, seed = 7 }) {
  const r = rng(seed);
  const lines = [];
  for (let d = days; d >= 1; d--) {
    for (let k = 0; k < perDay; k++) {
      const t = endAt - d * 86400 + Math.floor(r() * 86000);
      const ua = UAS[Math.floor(r() * UAS.length)];
      const [country, city] = PLACES[Math.floor(r() * PLACES.length)];
      const [referrer, referrerRaw] = REFERRERS[Math.floor(r() * REFERRERS.length)];
      const label = /googlebot/i.test(ua) ? 'Googlebot' : /bingbot/i.test(ua) ? 'Bingbot' : 'Unknown';
      lines.push({ t, line: JSON.stringify({ ip: ip(r), date: wall(t), country, city, source: label, device: legacyDeviceString(ua), ua_full: ua, referrer, referrer_raw: referrerRaw, path: pages[Math.floor(r() * pages.length)] }) });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  return `${lines.map((l) => l.line).join('\n')}\n`;
}

/** SQL for the analytics database: a synthetic legacy corpus plus native rows. */
export async function syntheticAnalyticsSql({ pages, now }) {
  const nativeStart = now - 20 * 86400;
  const log = syntheticPanelLog({ pages, endAt: nativeStart });
  const plan = await planCorpus(log);
  let sql = renderSql(importStatements(plan, { actor: 'synthetic-preview', now }));
  const r = rng(11);
  const rows = [];
  for (let i = 0; i < 160; i++) {
    const t = nativeStart + Math.floor((i / 160) * (now - nativeStart)) + Math.floor(r() * 3000);
    const ua = UAS[Math.floor(r() * UAS.length)];
    const [country, city, code] = PLACES[Math.floor(r() * PLACES.length)];
    const [, referrerRaw] = REFERRERS[Math.floor(r() * REFERRERS.length)];
    const path = pages[Math.floor(r() * pages.length)];
    const { sourceLabel, agent, automation } = classifyAgent(ua);
    const device = legacyDeviceString(ua);
    const { deviceClass, browser } = splitDevice(device);
    const uid = `aw:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const v = [uid, 'native', t, laDay(t), t, ip(r), country, code, '', city.split(',')[0], path, normalizePage(path), referrerRaw ? new URL(referrerRaw).hostname : 'Direct', referrerRaw, ua, sourceLabel, device, deviceClass, browser, osFamily(ua), agent, automation]
      .map((x) => (typeof x === 'number' ? String(x) : `'${String(x).replace(/'/g, "''")}'`));
    rows.push(`INSERT OR IGNORE INTO visitor_events (event_uid, origin, occurred_at, la_day, received_at, ip, country, country_code, region, city, path, page, referrer, referrer_raw, user_agent, source_label, device, device_class, browser, os, agent, automation) VALUES (${v.join(', ')});`);
  }
  sql += `${rows.join('\n')}\n`;
  sql += `INSERT INTO analytics_coverage (kind, started_at, note, created_at) SELECT 'native_start', ${nativeStart}, 'synthetic preview', ${now} WHERE NOT EXISTS (SELECT 1 FROM analytics_coverage WHERE kind = 'native_start');\n`;
  return { sql, log, sha256: plan.sha256 };
}

/** SQL for the app database: synthetic reaction counts on real published ids. */
export function syntheticAppSql({ ids, now }) {
  const r = rng(3);
  const out = [];
  for (const id of ids.slice(0, 30)) {
    for (const reaction of ['wat', 'lol', 'same', 'dead']) {
      const n = Math.floor(r() * 6);
      if (n) out.push(`INSERT OR IGNORE INTO reaction_counts (item_id, reaction, count, updated_at) VALUES ('${id}', '${reaction}', ${n}, ${now});`);
    }
  }
  return `${out.join('\n')}\n`;
}

/** Local editorial queue with prepared/incomplete drafts and duplicate groups. */
export function syntheticReviewCandidates(count = 80) {
  const headlines = [
    'Library accidentally lends its own doorbell to a reader',
    'Raccoon delays the opening of a town hall meeting',
    'Parking meter issues a receipt longer than the car',
    'Florida resident returns a shopping cart by canoe',
    'HOA sends a warning letter to a plastic flamingo',
    'Bakery labels a pothole as its newest pastry',
    'County printer produces permits with upside down maps',
    'Lost garden gnome found supervising a construction site',
    'School bus driver wins a dispute with a talking mailbox',
    'Restaurant introduces a reservation system for squirrels',
    'Volunteer fire crew rescues a ladder from a tree',
    'City installs a sign explaining the previous sign',
  ];
  const categories = ['only-in-america', 'crime-weird', 'bureaucracy', 'florida-man', 'hoa-housing', 'food-crime'];
  const rows = [];
  for (let i = 0; i < Math.min(250, Math.max(1, Number(count) || 80)); i++) {
    const date = new Date(Date.UTC(2026, 9, 16) - i * 86400000).toISOString().slice(0, 10);
    const row = {
      id: `aw-preview-${i + 1}`, seen_id: `preview-${i + 1}`, title: `${headlines[i % headlines.length]} — case ${i + 1}`,
      category: categories[i % categories.length], date, source_name: 'Preview Desk', source_domain: 'example.com',
      external_url: `https://example.com/preview/${i + 1}`, source_url: i % 5 === 0 ? '' : `https://example.com/preview/${i + 1}`,
      comment: i % 3 === 0 ? '' : 'A local office documented an unexpected interruption. The paperwork has requested a second opinion.',
      excerpt: 'Synthetic candidate for testing the local review workflow. No real editorial decision is made here.',
      status: 'REAL', city: i % 2 ? 'Austin' : 'Tampa', state: i % 2 ? 'TX' : 'FL', score: 8,
      ...(i % 13 === 12 ? { draft_reason: 'ROUTINE', draft_note: 'Synthetic proposed rejection' } : {}),
    };
    rows.push(row);
    if (i % 16 === 0) rows.push({ ...row, id: `${row.id}-copy`, seen_id: `${row.seen_id}-copy`, source_name: 'Preview Wire', source_domain: 'wire.example.com', external_url: `https://wire.example.com/preview/${i + 1}` });
  }
  return rows;
}
