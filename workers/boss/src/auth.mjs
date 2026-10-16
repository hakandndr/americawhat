// Boss identity boundary: Cloudflare Access JWT verification, independent of
// the Access edge check (defence in depth).
//
// Fail closed, in this order:
//   1. configuration missing (team domain, audience, allowed emails) -> 503
//   2. no Cf-Access-Jwt-Assertion                                     -> 401
//   3. malformed token, wrong algorithm, unknown key, bad signature   -> 401
//   4. wrong issuer or audience, expired, not yet valid               -> 401
//   5. verified email not in BOSS_ALLOWED_EMAILS                      -> 403
// The Cf-Access-Authenticated-User-Email header is never trusted on its own.
// RS256 is verified with WebCrypto; the JWKS is fetched from the team domain
// and cached briefly. No dependency.

const JWKS_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
let jwksCache = { url: '', keys: null, fetchedAt: 0 };

export function resetKeyCache() {
  jwksCache = { url: '', keys: null, fetchedAt: 0 };
}

export function authConfig(env) {
  const teamDomain = String(env.BOSS_ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const audience = String(env.BOSS_ACCESS_AUD || '');
  const allowed = String(env.BOSS_ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ok = /^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(teamDomain) && audience.length >= 16 && allowed.length > 0;
  return { ok, teamDomain, audience, allowed };
}

function b64urlToBytes(segment) {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
}

async function loadKeys(config, fetchImpl) {
  const url = `https://${config.teamDomain}/cdn-cgi/access/certs`;
  const fresh = jwksCache.keys && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh) return jwksCache.keys;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = await res.json();
  const keys = Array.isArray(body?.keys) ? body.keys.filter((k) => k && k.kty === 'RSA' && k.n && k.e) : [];
  if (!keys.length) throw new Error('JWKS contained no RSA keys');
  jwksCache = { url, keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Local preview only: keys supplied in BOSS_DEV_JWKS are used when, and only
 * when, ENVIRONMENT is "local" AND the request arrived on a loopback address.
 * Staging and production never read this variable. The token is still fully
 * verified (signature, issuer, audience, time, email).
 */
export function localPreviewKeys(request, env) {
  if (env.ENVIRONMENT !== 'local' || !env.BOSS_DEV_JWKS) return null;
  const host = new URL(request.url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return null;
  const parsed = JSON.parse(env.BOSS_DEV_JWKS);
  return Array.isArray(parsed.keys) ? parsed.keys : null;
}

/**
 * Returns { ok: true, identity: { email, subject } } or { ok: false, status, error }.
 * options.fetchImpl and options.now are test seams.
 */
export async function authenticate(request, env, { fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  const config = authConfig(env);
  if (!config.ok) return { ok: false, status: 503, error: 'Boss identity is not configured.' };
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  if (!token) return { ok: false, status: 401, error: 'Missing Access assertion.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, error: 'Malformed assertion.' };

  let header;
  let payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return { ok: false, status: 401, error: 'Malformed assertion.' };
  }
  if (!header || typeof header !== 'object' || Array.isArray(header) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, status: 401, error: 'Malformed assertion.' };
  }
  if (header.alg !== 'RS256') return { ok: false, status: 401, error: 'Unexpected algorithm.' };

  let keys;
  try {
    keys = localPreviewKeys(request, env) || await loadKeys(config, fetchImpl);
  } catch { return { ok: false, status: 503, error: 'Identity keys unavailable.' }; }
  const candidates = header.kid ? keys.filter((k) => k.kid === header.kid) : keys;
  if (!candidates.length) return { ok: false, status: 401, error: 'Unknown signing key.' };

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  let signature;
  try { signature = b64urlToBytes(parts[2]); } catch { return { ok: false, status: 401, error: 'Malformed signature.' }; }
  let verified = false;
  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)) { verified = true; break; }
    } catch { /* try the next key */ }
  }
  if (!verified) return { ok: false, status: 401, error: 'Invalid signature.' };

  const t = now();
  if (payload.iss !== `https://${config.teamDomain}`) return { ok: false, status: 401, error: 'Wrong issuer.' };
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(config.audience)) return { ok: false, status: 401, error: 'Wrong audience.' };
  if (!Number.isFinite(payload.exp) || payload.exp + CLOCK_SKEW_SECONDS < t) return { ok: false, status: 401, error: 'Assertion expired.' };
  if (Number.isFinite(payload.nbf) && payload.nbf - CLOCK_SKEW_SECONDS > t) return { ok: false, status: 401, error: 'Assertion not yet valid.' };
  if (Number.isFinite(payload.iat) && payload.iat - CLOCK_SKEW_SECONDS > t) return { ok: false, status: 401, error: 'Assertion issued in the future.' };

  const email = String(payload.email || '').toLowerCase();
  if (!email || !config.allowed.includes(email)) return { ok: false, status: 403, error: 'This identity is not allowed.' };
  return { ok: true, identity: { email, subject: String(payload.sub || '') } };
}
