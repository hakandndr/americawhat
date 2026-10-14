// Visitor classification shared by the native collector and the legacy importer,
// so a native row and an imported legacy row with the same user agent get the
// same labels. A user agent can be forged: every label here is what the client
// CLAIMS to be, never a verified identity.

// The legacy PHP logger's crawler table (label written to `source`), kept in
// its original order so legacy and native rows classify identically.
export const LEGACY_SOURCE_PATTERNS = Object.freeze([
  ['googlebot', 'Googlebot'], ['bingbot', 'Bingbot'], ['slurp', 'Yahoo Bot'],
  ['duckduckbot', 'DuckDuckBot'], ['baiduspider', 'Baidubot'], ['yandexbot', 'Yandexbot'],
  ['facebookbot', 'Facebookbot'], ['twitterbot', 'Twitterbot'], ['applebot', 'Applebot'],
  ['semrushbot', 'SEMrush'], ['ahrefsbot', 'Ahrefs'], ['mj12bot', 'Majestic'],
  ['dotbot', 'OpenSite'], ['petalbot', 'Petal'], ['palo alto', 'Palo Alto Scanner'],
  ['nessus', 'Nessus Scanner'], ['nikto', 'Nikto Scanner'], ['masscan', 'Masscan'],
  ['zgrab', 'ZGrab'], ['python-requests', 'Python Script'], ['curl/', 'cURL'],
  ['wget/', 'Wget'], ['go-http-client', 'Go HTTP'], ['dataforseo', 'DataForSEO'],
  ['archive.org_bot', 'Wayback'],
]);

// Additional families recognised by the native collector only. Specific
// signatures come before generic ones.
const EXTRA_AUTOMATED = Object.freeze([
  ['adsbot-google', 'Google AdsBot'], ['google-inspectiontool', 'Google (other)'],
  ['googleother', 'Google (other)'], ['facebookexternalhit', 'Meta'],
  ['meta-externalagent', 'Meta'], ['linkedinbot', 'LinkedInBot'], ['slackbot', 'Slackbot'],
  ['discordbot', 'Discordbot'], ['telegrambot', 'TelegramBot'], ['whatsapp', 'WhatsApp'],
  ['bytespider', 'Bytespider'], ['gptbot', 'GPTBot'], ['oai-searchbot', 'OAI-SearchBot'],
  ['chatgpt-user', 'ChatGPT-User'], ['claudebot', 'ClaudeBot'], ['claude-user', 'Claude-User'],
  ['claude-searchbot', 'Claude-SearchBot'], ['perplexitybot', 'PerplexityBot'],
  ['ccbot', 'CCBot'], ['amazonbot', 'Amazonbot'], ['headlesschrome', 'Headless Chrome'],
  ['phantomjs', 'PhantomJS'], ['node-fetch', 'Node fetch'], ['axios/', 'Axios'],
  ['okhttp', 'OkHttp'], ['java/', 'Java client'], ['libwww-perl', 'Perl LWP'],
  ['scrapy', 'Scrapy'], ['uptimerobot', 'UptimeRobot'], ['pingdom', 'Pingdom'],
  ['statuscake', 'StatusCake'], ['dndr-monitor', 'DNDR monitor'],
]);

const GENERIC_BOT = /bot\b|crawler|spider|scanner|monitor|preview|fetcher|headless/i;

/** The legacy logger's label for a user agent ('Unknown' when no pattern matched). */
export function legacySourceLabel(userAgent) {
  const ua = String(userAgent ?? '').toLowerCase();
  for (const [pattern, label] of LEGACY_SOURCE_PATTERNS) if (ua.includes(pattern)) return label;
  return 'Unknown';
}

/**
 * Native classification: { sourceLabel, agent, automation }.
 * sourceLabel stays comparable with legacy rows ('Unknown' = no crawler matched).
 */
export function classifyAgent(userAgent) {
  const raw = String(userAgent ?? '');
  const ua = raw.toLowerCase();
  const sourceLabel = legacySourceLabel(raw);
  if (sourceLabel !== 'Unknown') return { sourceLabel, agent: sourceLabel, automation: 'automated' };
  for (const [pattern, label] of EXTRA_AUTOMATED) if (ua.includes(pattern)) return { sourceLabel, agent: label, automation: 'automated' };
  if (raw.trim() === '' || ua === 'unknown') return { sourceLabel, agent: 'No user agent', automation: 'automated' };
  if (GENERIC_BOT.test(raw)) return { sourceLabel, agent: 'Other automated', automation: 'automated' };
  return { sourceLabel, agent: 'Browser', automation: 'human' };
}

/** A legacy row's actor class, from its stored label only (never re-derived from the UA). */
export function automationFromLegacyLabel(label) {
  return label === 'Unknown' || label === 'Human' || label === '' || label == null ? 'human' : 'automated';
}

/** The legacy logger's "Mobile / Chrome 120" string, reproduced for native rows. */
export function legacyDeviceString(userAgent) {
  const ua = String(userAgent ?? '');
  const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
  let browser = 'Other';
  let m;
  if ((m = /Edg\/(\d+)/i.exec(ua))) browser = `Edge ${m[1]}`;
  else if ((m = /OPR\/(\d+)/i.exec(ua))) browser = `Opera ${m[1]}`;
  else if ((m = /Chrome\/(\d+)/i.exec(ua))) browser = `Chrome ${m[1]}`;
  else if ((m = /Firefox\/(\d+)/i.exec(ua))) browser = `Firefox ${m[1]}`;
  else if (/Safari\/(\d+)/i.test(ua)) browser = 'Safari';
  return `${device} / ${browser}`;
}

/** { deviceClass, browser } from a stored "Mobile / Chrome 120" string. */
export function splitDevice(device) {
  const text = String(device ?? '');
  const deviceClass = text.startsWith('Mobile') ? 'mobile' : text.startsWith('Desktop') ? 'desktop' : 'unknown';
  const slash = text.indexOf(' / ');
  return { deviceClass, browser: slash >= 0 ? text.slice(slash + 3) : '' };
}

/** Best-effort operating system family from a user agent. */
export function osFamily(userAgent) {
  const ua = String(userAgent ?? '');
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

/** Path without fragment or query; extensionless paths get the trailing slash. */
export function normalizePage(path) {
  let page = String(path ?? '');
  const hash = page.indexOf('#');
  if (hash >= 0) page = page.slice(0, hash);
  const query = page.indexOf('?');
  if (query >= 0) page = page.slice(0, query);
  if (page === '') return '-';
  if (page === '-' || page.endsWith('/') || page.includes('.') || !page.startsWith('/')) return page;
  return `${page}/`;
}

/** The legacy logger's referrer label, reproduced for native rows. */
export function referrerLabel(raw) {
  const ref = String(raw ?? '').trim();
  if (ref === '') return 'Direct';
  const lower = ref.toLowerCase();
  for (const [needle, label] of [['google', 'Google'], ['bing', 'Bing'], ['instagram', 'Instagram'],
    ['facebook', 'Facebook'], ['twitter', 'Twitter'], ['linkedin', 'LinkedIn'], ['reddit', 'Reddit']]) {
    if (lower.includes(needle)) return label;
  }
  try { return new URL(ref).hostname || ref; } catch { return ref; }
}
