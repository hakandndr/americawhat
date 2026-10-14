// americawhat-web: the public site (Workers Static Assets) plus the small public
// API that replaces the Hostinger PHP endpoints.
//
// Routes handled by code (everything else is a static asset):
//   GET  /api/health
//   GET  /api/reactions?ids=a,b      POST /api/reactions   {id, reaction}
//   POST /api/pv                      {evt, path, referrer}
//   Compatibility with the URLs the current pages call (same on Hostinger):
//   GET  /analytics/get_votes.php?ids=   POST /analytics/vote.php   (form)
//   POST /analytics/log_df.php           (form: path, referrer, evt)
// No GET request changes state. Anything else under /analytics/ is 404, so no
// PHP source, log or JSON file can ever be served from this Worker.

import publishedData from '../../../src/data/published.json' with { type: 'json' };
import { json, methodNotAllowed, readBody } from '../../shared/http.mjs';
import { nowSeconds } from '../../shared/time.mjs';
import { buildNativeEvent, storeNativeEvent } from './collector.mjs';
import { dndrPageEvent, forwardAndRecord, forwardingEnabled } from './dndr-forward.mjs';
import { parseIds, readCounts, recordReaction } from './reactions.mjs';

const PUBLISHED_IDS = new Set((publishedData.items || publishedData).map((it) => it.id).filter(Boolean));

function allowedOrigins(env) {
  return String(env.PUBLIC_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** POSTs must come from one of this site's own origins. */
function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  return allowedOrigins(env).includes(origin);
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '';
}

async function handleReactionsRead(url, env) {
  const ids = parseIds(url.searchParams.get('ids'));
  return json(await readCounts(env.APP_DB, ids), 200, { 'Cache-Control': 'no-store' });
}

async function handleReactionWrite(request, env, legacyShape) {
  if (!originAllowed(request, env)) return json({ status: 'error', message: 'forbidden' }, 403);
  const body = await readBody(request, 1024);
  if (!body) return json({ status: 'error', message: 'bad request' }, 400);
  const result = await recordReaction(env.APP_DB, {
    itemId: String(body.id ?? '').trim(),
    reaction: String(body.reaction ?? '').trim(),
    ip: clientIp(request),
    secret: env.REACTION_GUARD_SECRET,
    publishedIds: PUBLISHED_IDS,
    now: nowSeconds(),
  });
  if (result.status !== 'ok') {
    return json(legacyShape ? { status: 'error', message: result.error } : { status: 'error', error: result.error }, result.http);
  }
  return json({ status: 'ok', counted: result.counted, counts: result.counts });
}

async function handlePageView(request, env, ctx, { form }) {
  if (!originAllowed(request, env)) return json({ status: 'error', error: 'forbidden' }, 403);
  const body = await readBody(request, 2048);
  if (!body) return json({ status: 'error', error: 'bad_request' }, 400);
  // Old cached pages may not send an event id; one is generated for them.
  if (form && !body.evt) body.evt = crypto.randomUUID();
  const now = nowSeconds();
  const built = buildNativeEvent({
    body, ip: clientIp(request), userAgent: request.headers.get('User-Agent'), cf: request.cf, now,
  });
  if (!built.ok) return json({ status: 'error', error: built.error }, 400);
  const withOutbox = forwardingEnabled(env);
  const outcome = await storeNativeEvent(env.ANALYTICS_DB, built.row, { withOutbox });
  if (outcome === 'stored' && withOutbox) {
    const hostname = env.SITE_HOSTNAME || new URL(request.url).hostname;
    ctx.waitUntil(forwardAndRecord(env, env.ANALYTICS_DB, dndrPageEvent(built.row, hostname), now));
  }
  return json({ status: 'ok' }, outcome === 'rate_limited' ? 202 : 200);
}

async function handleHealth(env) {
  const checks = {};
  for (const [name, db] of [['app_db', env.APP_DB], ['analytics_db', env.ANALYTICS_DB]]) {
    try {
      const row = await db.prepare('SELECT 1 AS ok').first();
      checks[name] = row && Number(row.ok) === 1 ? 'ok' : 'error';
    } catch { checks[name] = 'error'; }
  }
  checks.reaction_secret = env.REACTION_GUARD_SECRET ? 'ok' : 'missing';
  const ok = Object.values(checks).every((v) => v === 'ok');
  return json({
    status: ok ? 'ok' : 'degraded',
    environment: env.ENVIRONMENT || 'unknown',
    release: env.RELEASE_ID || 'unversioned',
    published_items: PUBLISHED_IDS.size,
    checks,
  }, ok ? 200 : 503);
}

export async function route(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/health') return method === 'GET' || method === 'HEAD' ? handleHealth(env) : methodNotAllowed('GET');
  if (pathname === '/api/reactions') {
    if (method === 'GET') return handleReactionsRead(url, env);
    if (method === 'POST') return handleReactionWrite(request, env, false);
    return methodNotAllowed('GET, POST');
  }
  if (pathname === '/api/pv') return method === 'POST' ? handlePageView(request, env, ctx, { form: false }) : methodNotAllowed('POST');

  if (pathname === '/analytics/get_votes.php') return method === 'GET' ? handleReactionsRead(url, env) : methodNotAllowed('GET');
  if (pathname === '/analytics/vote.php') return method === 'POST' ? handleReactionWrite(request, env, true) : methodNotAllowed('POST');
  if (pathname === '/analytics/log_df.php') {
    if (method === 'POST') return handlePageView(request, env, ctx, { form: true });
    // An old page calling with GET is answered without storing anything:
    // a GET never changes state.
    if (method === 'GET' || method === 'HEAD') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    return methodNotAllowed('POST');
  }
  if (pathname.startsWith('/api/') || pathname.startsWith('/analytics/') || pathname === '/analytics') {
    return json({ status: 'error', error: 'not_found' }, 404);
  }
  return null;
}

/**
 * Static Assets answers "/about" with a 307 to "/about/". The site has always
 * answered 301 (Apache), and search engines treat the two differently, so the
 * same-origin trailing-slash redirect is kept permanent. Other redirects pass
 * through unchanged.
 */
export function permanentSlashRedirect(request, response) {
  if (response.status !== 307 && response.status !== 308) return response;
  const location = response.headers.get('Location');
  if (!location) return response;
  const from = new URL(request.url);
  const to = new URL(location, from);
  if (to.origin !== from.origin || to.pathname !== `${from.pathname}/` || to.search !== from.search) return response;
  return new Response(null, { status: 301, headers: { Location: `${to.pathname}${to.search}`, 'Cache-Control': 'public, max-age=3600' } });
}

export default {
  async fetch(request, env, ctx) {
    let response;
    try {
      response = await route(request, env, ctx);
    } catch (error) {
      console.error(`web: unhandled ${error instanceof Error ? error.message : String(error)}`);
      response = json({ status: 'error', error: 'internal' }, 500);
    }
    if (!response) response = permanentSlashRedirect(request, await env.ASSETS.fetch(request));
    if (env.ENVIRONMENT !== 'production') {
      response = new Response(response.body, response);
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return response;
  },
};
