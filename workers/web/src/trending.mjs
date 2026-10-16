// Homepage "Trending" strip, rendered at the edge.
//
// The static homepage ships the strip hidden and empty. Filling it in the
// browser after a reactions fetch pushed everything below it down after first
// paint, so the Worker fills it while the HTML streams through: one bounded
// APP_DB read, the same markup the page used to build, and the same rule (shown
// only with at least three stories that have reactions). The section is marked
// with data-trending ("edge", "none" or "unavailable") so the page script only
// refreshes the counts and never inserts or removes rows itself.
//
// Each isolate keeps its last good result: for TRENDING_FRESH_MS it is served
// without touching D1 (concurrent misses share one read), and when a read
// fails or exceeds the timeout the last good strip is served instead of
// hiding it. Only an isolate that never read successfully answers
// "unavailable"; the page script then builds the strip in the browser as the
// static site always did. Trending is never worth a broken or late homepage.

import publishedData from '../../../src/data/published.json' with { type: 'json' };
import { assignSlugs } from '../../../src/lib/slug.js';
import { readTopTotals } from './reactions.mjs';

export const TRENDING_MAX = 5;
export const TRENDING_MIN = 3;
export const TRENDING_READ_TIMEOUT_MS = 300;
export const TRENDING_FRESH_MS = 30_000;
export const TRENDING_STALE_MAX_MS = 24 * 3600 * 1000;

let lastGood = null; // { at, top }
let inFlight = null;

/** Forget the isolate's cached strip (tests). */
export function resetTrending() { lastGood = null; inFlight = null; }

const result = (top) => ({ state: top.length ? 'edge' : 'none', top });

const PUBLISHED_ITEMS = publishedData.items || publishedData;

/** id -> { id, title, href, date } for every published story, as the homepage lists them. */
export function storiesById(items = PUBLISHED_ITEMS) {
  const slugs = assignSlugs(items);
  const out = new Map();
  items.forEach((item, index) => {
    if (item.id) out.set(item.id, { id: item.id, title: String(item.title ?? ''), href: `/item/${slugs[index]}/`, date: String(item.date ?? '') });
  });
  return out;
}

const STORIES = storiesById();

/**
 * The top stories from [{ item_id, total }]: published only, most reacted
 * first, newest first on a tie. Empty when fewer than TRENDING_MIN qualify.
 */
export function pickTrending(totals, stories = STORIES) {
  const rows = [];
  for (const { item_id: id, total } of totals) {
    const story = stories.get(id);
    if (story && Number.isFinite(total) && total > 0) rows.push({ ...story, total });
  }
  rows.sort((a, b) => b.total - a.total || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (a.id < b.id ? -1 : 1));
  const top = rows.slice(0, TRENDING_MAX);
  return top.length >= TRENDING_MIN ? top : [];
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** The <li> rows of #trending-list (same markup the page script used to build). */
export function trendingItemsHtml(top) {
  return top.map((r, i) =>
    `<li data-id="${escapeHtml(r.id)}"><a href="${escapeHtml(r.href)}"><span class="trending-rank">${i + 1}</span><span class="trending-title">${escapeHtml(r.title)}</span><span class="trending-count">${Math.trunc(r.total)}</span></a></li>`,
  ).join('');
}

/** { state: 'edge' | 'none' | 'unavailable', top } — never throws. */
export async function loadTrending(db, timeoutMs = TRENDING_READ_TIMEOUT_MS, now = Date.now()) {
  if (lastGood && now - lastGood.at < TRENDING_FRESH_MS) return result(lastGood.top);
  inFlight ??= readFresh(db, timeoutMs, now).finally(() => { inFlight = null; });
  return inFlight;
}

async function readFresh(db, timeoutMs, now) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); });
    const top = pickTrending(await Promise.race([readTopTotals(db), timeout]));
    lastGood = { at: now, top };
    return result(top);
  } catch (error) {
    console.error(`web: trending read failed ${error instanceof Error ? error.message : String(error)}`);
    if (lastGood && now - lastGood.at < TRENDING_STALE_MAX_MS) return result(lastGood.top);
    return { state: 'unavailable', top: [] };
  } finally {
    clearTimeout(timer);
  }
}

export function isHomepageRequest(request) {
  return (request.method === 'GET' || request.method === 'HEAD') && new URL(request.url).pathname === '/';
}

/**
 * Fetches the homepage asset and fills the Trending strip. Conditional request
 * headers are dropped so the asset layer never answers 304 for a page whose
 * body now changes with the counts; the stored ETag no longer describes the
 * body, so it is removed (from HEAD answers too, which skip the D1 read).
 */
export async function serveHomepage(request, env) {
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const head = request.method === 'HEAD';
  const [asset, trending] = await Promise.all([
    env.ASSETS.fetch(new Request(request, { headers })),
    head ? null : loadTrending(env.APP_DB),
  ]);
  if (asset.status !== 200 || !(asset.headers.get('Content-Type') || '').includes('text/html')) return asset;
  if (head) return withoutValidators(new Response(null, asset));
  const html = trendingItemsHtml(trending.top);
  const rewritten = new HTMLRewriter()
    .on('section#trending', {
      element(el) {
        el.setAttribute('data-trending', trending.state);
        if (trending.top.length) el.removeAttribute('hidden');
      },
    })
    .on('ol#trending-list', {
      element(el) { if (html) el.setInnerContent(html, { html: true }); },
    })
    .transform(asset);
  return withoutValidators(new Response(rewritten.body, rewritten));
}

function withoutValidators(response) {
  response.headers.delete('ETag');
  response.headers.delete('Content-Length');
  return response;
}
