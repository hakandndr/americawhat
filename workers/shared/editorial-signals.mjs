// Deterministic editorial signals for the weekly review. These never decide
// anything: they cluster duplicate coverage, point at already-published
// stories, flag geography and hard-reject risks, and rank candidates so the
// owner reads the most promising distinct stories first. The owner approves
// or rejects every story; nothing here publishes or deletes.

export const CATEGORIES = Object.freeze(['florida-man', 'hoa-housing', 'bureaucracy', 'crime-weird', 'only-in-america', 'food-crime', 'fine-print']);
export const STATUSES = Object.freeze(['REAL', 'SUBMITTED', 'UNVERIFIED']);

export const REJECTION_REASONS = Object.freeze({
  NOT_US: 'Not in the United States',
  ALREADY_PUBLISHED: 'Already published',
  DUPLICATE: 'Duplicate of another candidate',
  HARD_REJECT_MINOR: 'Hard reject: minors / child harm',
  HARD_REJECT_SEXUAL: 'Hard reject: sexual offence',
  HARD_REJECT_ANIMAL: 'Hard reject: animal cruelty',
  HARD_REJECT_DOMESTIC: 'Hard reject: domestic violence',
  HARD_REJECT_VIOLENCE: 'Hard reject: serious violence or threats',
  HARD_REJECT_HATE: 'Hard reject: hate crime',
  HARD_REJECT_VULNERABLE_FRAUD: 'Hard reject: fraud against a vulnerable victim',
  HARD_REJECT_DEATH_MISSING: 'Hard reject: suicide, remains or missing person',
  HARD_REJECT_POLITICS: 'Hard reject: partisan politics or named public figure',
  ROUTINE: 'Routine business, not absurd',
  LISTICLE: 'Listicle, roundup or trend piece',
  ORDINARY_CRIME: 'Ordinary crime without a hook',
  UNVERIFIABLE: 'Original source could not be verified',
  OTHER: 'Other (see note)',
});

const STOPWORDS = new Set(('a an the and or of in on at to for from by with after before over into his her their its is are was were be been '
  + 'man woman says said police cops officials report reports new news video watch photos update local after amid as about '
  + 'he she they it this that who what when where why how').split(' '));

const tokenCache = new Map();

/** Lower-case content tokens of a headline; publisher suffix removed (memoised). */
export function titleTokens(title) {
  const key = String(title ?? '');
  let cached = tokenCache.get(key);
  if (!cached) {
    if (tokenCache.size > 5000) tokenCache.clear();
    cached = computeTitleTokens(key);
    tokenCache.set(key, cached);
  }
  return cached;
}

function computeTitleTokens(title) {
  const t = String(title ?? '')
    .replace(/\s+[-|–—]\s+[^-|–—]{2,60}$/, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9$ ]+/g, ' ');
  return new Set(t.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w)));
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function daysBetween(a, b) {
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return 0;
  return Math.abs(x - y) / 86400000;
}

/**
 * Groups candidates that report the same story (union-find over pairs whose
 * headline similarity reaches `threshold` within `windowDays`).
 * Returns clusters: [{ key, members: [item, ...] }] in input order.
 */
export function clusterCandidates(items, { threshold = 0.5, windowDays = 7 } = {}) {
  const tokens = items.map((it) => titleTokens(it.title));
  const days = items.map((it) => { const t = Date.parse(it.date); return Number.isNaN(t) ? null : t / 86400000; });
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (days[i] != null && days[j] != null && Math.abs(days[i] - days[j]) > windowDays) continue;
      const sameUrl = items[i].external_url && items[i].external_url === items[j].external_url;
      if (sameUrl || jaccard(tokens[i], tokens[j]) >= threshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((it, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(it);
  });
  return [...groups.values()].map((members) => ({ key: members[0].seen_id || members[0].id, members }));
}

// Outlets that should not be the chosen source when a newsroom covered it.
export const AGGREGATORS = ['news.google.com', 'msn.com', 'yahoo.com', 'aol.com', 'newsbreak.com', 'flipboard.com', 'ground.news',
  'twistedsifter.com', 'boredpanda.com', 'newsweek.com', 'dailymail.co.uk', 'the-sun.com', 'nypost.com', 'inkl.com', 'headtopics.com'];

export function isAggregator(domain) {
  const d = String(domain ?? '').toLowerCase();
  return AGGREGATORS.some((a) => d === a || d.endsWith(`.${a}`));
}

export function isGoogleNewsUrl(url) {
  return /^https?:\/\/news\.google\.com\//i.test(String(url ?? ''));
}

/** A usable original-source URL: http(s), a real host, not a Google News redirect. */
export function isOriginalSourceUrl(url) {
  try {
    const u = new URL(String(url));
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') && !isGoogleNewsUrl(url) && !/(^|\.)google\.com$/i.test(u.hostname);
  } catch { return false; }
}

/** Prefers a newsroom over an aggregator, then a resolved link, then the higher fetch score. */
export function pickRepresentative(members) {
  const rank = (it) => (isAggregator(it.source_domain) ? 0 : 4) + (isOriginalSourceUrl(it.source_url || it.external_url) ? 2 : 0) + (Number(it.score) || 0) / 100;
  return [...members].sort((a, b) => rank(b) - rank(a))[0];
}

const FOREIGN_TLDS = ['uk', 'in', 'au', 'ca', 'ie', 'nz', 'np', 'ua', 'vn', 'pk', 'ng', 'za', 'ph', 'my', 'sg', 'lk', 'bd', 'ke', 'gh', 'eu', 'de', 'fr', 'it', 'es', 'nl', 'jp', 'cn', 'ru'];
const FOREIGN_PLACES = ['uk', 'britain', 'british', 'england', 'english', 'scotland', 'wales', 'welsh', 'london', 'manchester', 'birmingham',
  'india', 'indian', 'delhi', 'mumbai', 'bengaluru', 'nepal', 'kathmandu', 'australia', 'australian', 'sydney', 'melbourne', 'queensland',
  'canada', 'canadian', 'ontario', 'toronto', 'vancouver', 'quebec', 'alberta', 'ireland', 'irish', 'dublin', 'ukraine', 'kyiv', 'pakistan',
  'cardiff', 'portsmouth', 'liverpool', 'leeds', 'glasgow', 'edinburgh', 'belfast', 'nigeria', 'philippines', 'japan', 'china', 'chinese', 'germany', 'france', 'spain', 'italy', 'mexico city', 'new zealand', 'singapore', 'dubai'];
// British spellings and currency are a weak foreign signal on their own.
const FOREIGN_MARKERS = ['jewellery', 'colour', 'councillor', 'council tax', '£', 'nhs', 'premier league', 'rupees', 'lakh'];
const US_SIGNALS = ['florida', 'texas', 'california', 'ohio', 'georgia', 'arizona', 'michigan', 'pennsylvania', 'new york', 'new jersey', 'illinois',
  'north carolina', 'south carolina', 'tennessee', 'kentucky', 'alabama', 'louisiana', 'mississippi', 'missouri', 'virginia', 'washington state',
  'oregon', 'nevada', 'utah', 'colorado', 'oklahoma', 'kansas', 'nebraska', 'iowa', 'minnesota', 'wisconsin', 'indiana', 'maryland',
  'massachusetts', 'connecticut', 'maine', 'vermont', 'new hampshire', 'rhode island', 'delaware', 'arkansas', 'idaho', 'montana', 'wyoming',
  'dakota', 'new mexico', 'alaska', 'hawaii', 'west virginia', 'sheriff', 'deputies', 'hoa', 'homeowners association', 'dmv', 'county'];

const phraseCache = new Map();

function hasPhrase(text, phrase) {
  let re = phraseCache.get(phrase);
  if (!re) {
    re = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    phraseCache.set(phrase, re);
  }
  return re.test(text);
}

/** 'us_likely' | 'foreign_likely' | 'unknown', with the evidence. */
export function geography(item) {
  const text = `${item.title || ''} ${item.excerpt || ''}`.toLowerCase();
  const domain = String(item.source_domain || '').toLowerCase();
  const tld = domain.split('.').pop();
  const evidence = [];
  if (FOREIGN_TLDS.includes(tld) && !domain.endsWith('.us')) evidence.push(`tld:.${tld}`);
  for (const p of FOREIGN_PLACES) if (hasPhrase(text, p)) evidence.push(`place:${p}`);
  for (const p of FOREIGN_MARKERS) if (p === '£' ? text.includes(p) : hasPhrase(text, p)) evidence.push(`marker:${p}`);
  const us = US_SIGNALS.filter((p) => hasPhrase(text, p));
  if (item.state) us.push(`state:${item.state}`);
  if (evidence.length && !us.length) return { verdict: 'foreign_likely', evidence };
  if (us.length && !evidence.length) return { verdict: 'us_likely', evidence: us.slice(0, 3) };
  return { verdict: 'unknown', evidence: [...evidence, ...us].slice(0, 4) };
}

const RISK_TERMS = {
  HARD_REJECT_MINOR: ['child', 'children', 'minor', 'minors', 'toddler', 'infant', 'baby', 'teen', 'teenager', 'student', 'students', 'juvenile', 'kid', 'kids'],
  HARD_REJECT_SEXUAL: ['sexual', 'sex', 'indecent', 'exposure', 'exposed himself', 'lewd', 'rape', 'voyeur', 'voyeurism', 'hidden camera', 'groom', 'grooming', 'predator', 'sting', 'molest', 'pornography', 'g-string'],
  HARD_REJECT_ANIMAL: ['cruelty', 'neglect', 'starved', 'starving', 'hoarding', 'abused dog', 'animal abuse', 'dead dogs', 'dead cats'],
  HARD_REJECT_DOMESTIC: ['domestic', 'strangled', 'strangulation', 'girlfriend', 'boyfriend', 'ex-wife', 'ex-husband', 'battery'],
  HARD_REJECT_VIOLENCE: ['shot', 'shooting', 'shootings', 'stabbed', 'stabbing', 'murder', 'killed', 'homicide', 'gun', 'firearm', 'machete', 'bomb', 'explosive', 'threat', 'threats', 'kidnap', 'hostage', 'carjacking'],
  HARD_REJECT_HATE: ['hate crime', 'synagogue', 'mosque', 'swastika', 'racist', 'slur'],
  HARD_REJECT_VULNERABLE_FRAUD: ['elderly', 'senior citizen', 'grandmother', 'grandfather', 'veteran scammed', 'disabled'],
  HARD_REJECT_DEATH_MISSING: ['suicide', 'remains', 'body found', 'bodies', 'missing', 'dead', 'death', 'died', 'fatal', 'overdose'],
  HARD_REJECT_POLITICS: ['trump', 'biden', 'harris', 'vance', 'desantis', 'newsom', 'republican', 'democrat', 'gop', 'congressman', 'congresswoman', 'senator', 'maga'],
};

/** Hard-reject risk flags with the matched terms. A flag means "read the source first", not "reject". */
export function riskFlags(item) {
  const text = `${item.title || ''} ${item.excerpt || ''}`.toLowerCase();
  const flags = [];
  for (const [code, terms] of Object.entries(RISK_TERMS)) {
    const hits = terms.filter((t) => hasPhrase(text, t));
    if (hits.length) flags.push({ code, terms: hits.slice(0, 4) });
  }
  return flags;
}

/** Best match among published items: { id, title, similarity } or null. */
export function publishedMatch(item, published, threshold = 0.55) {
  const tokens = titleTokens(item.title);
  let best = null;
  for (const p of published) {
    if (item.seen_id && p.seen_id && item.seen_id === p.seen_id) return { id: p.id, title: p.title, similarity: 1, reason: 'seen_id' };
    if (item.source_url && p.source_url && item.source_url === p.source_url) return { id: p.id, title: p.title, similarity: 1, reason: 'source_url' };
    const sim = jaccard(tokens, titleTokens(p.title));
    if (sim >= threshold && (!best || sim > best.similarity)) best = { id: p.id, title: p.title, similarity: Math.round(sim * 100) / 100, reason: 'title' };
  }
  return best;
}

/** Sentence count used to enforce the two-sentence comment. Initials, Mr./St. and similar do not end a sentence. */
export function countSentences(text) {
  const t = String(text ?? '').trim()
    .replace(/\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Mt|Ft|vs|etc|No|Inc|Co|Lt|Sgt|Capt|Gov|Sen|Rep|Ave|Blvd|Rd)\./g, (m) => m.replace('.', '§'))
    .replace(/\b(?:[A-Z]\.){2,}/g, (m) => m.replace(/\./g, '§'))
    .replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g, '$1§')
    .replace(/(\d)\.(\d)/g, '$1§$2');
  if (!t) return 0;
  const parts = t.split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9$])/).filter((s) => s.trim());
  return parts.length;
}

const SCARCE = new Set(['food-crime', 'fine-print']);

/**
 * The review packet: one entry per story cluster, ranked. Every candidate
 * stays visible; nothing is removed.
 */
export function buildReview(pending, published, options = {}) {
  const clusters = clusterCandidates(pending, options);
  const entries = clusters.map((cluster) => {
    const rep = pickRepresentative(cluster.members);
    const geo = geography(rep);
    const flags = riskFlags(rep);
    const match = publishedMatch(rep, published);
    const unresolved = !isOriginalSourceUrl(rep.source_url) && !isOriginalSourceUrl(rep.external_url);
    let priority = Number(rep.score) || 0;
    priority += Math.min(cluster.members.length, 10);
    if (SCARCE.has(rep.category)) priority += 4;
    if (geo.verdict === 'foreign_likely') priority -= 20;
    if (geo.verdict === 'us_likely') priority += 2;
    if (match) priority -= 30;
    priority -= flags.length * 6;
    const suggestions = [];
    if (match) suggestions.push('ALREADY_PUBLISHED');
    if (geo.verdict === 'foreign_likely') suggestions.push('NOT_US');
    for (const f of flags) suggestions.push(f.code);
    return {
      key: cluster.key,
      representative: rep,
      members: cluster.members,
      copies: cluster.members.length,
      geography: geo,
      flags,
      publishedMatch: match,
      sourceUnresolved: unresolved,
      priority,
      suggestions,
      drafted: Boolean(rep.comment && rep.comment.trim()),
    };
  });
  entries.sort((a, b) => b.priority - a.priority || String(a.representative.title).localeCompare(String(b.representative.title)));
  return {
    candidates: pending.length,
    stories: entries.length,
    flagged: entries.filter((e) => e.flags.length).length,
    foreign: entries.filter((e) => e.geography.verdict === 'foreign_likely').length,
    alreadyPublished: entries.filter((e) => e.publishedMatch).length,
    entries,
  };
}

/**
 * A prepared draft carries every field an approval needs and passes the same
 * checks without an override: two-sentence comment, valid category, REAL
 * status, a date, a source name and an original (non-aggregator) article URL.
 * Only these are picked by "Select prepared drafts".
 */
export function isPreparedDraft(rep) {
  let host = '';
  try { host = new URL(String(rep.source_url || '')).hostname; } catch { return false; }
  return Boolean(String(rep.title || '').trim() && String(rep.source_name || '').trim())
    && countSentences(rep.comment || '') === 2
    && CATEGORIES.includes(rep.category)
    && rep.status === 'REAL'
    && /^\d{4}-\d{2}-\d{2}$/.test(String(rep.date || ''))
    && isOriginalSourceUrl(rep.source_url) && !isAggregator(host);
}
