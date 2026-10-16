// CSRF and Origin protection for every state-changing Boss request.
// Access already requires an authenticated browser session; these checks stop
// another site from driving that session:
//   - Origin must equal BOSS_ORIGIN (and Sec-Fetch-Site, when sent, must be
//     same-origin);
//   - the form must carry a token bound to the verified identity and the
//     current or previous 12-hour window, HMAC'd with BOSS_CSRF_SECRET.

import { hmacHex, safeEqual } from '../../shared/http.mjs';

const WINDOW_SECONDS = 12 * 3600;

export async function csrfToken(env, identity, now = Math.floor(Date.now() / 1000)) {
  if (!env.BOSS_CSRF_SECRET) throw new Error('BOSS_CSRF_SECRET missing');
  const window = Math.floor(now / WINDOW_SECONDS);
  return hmacHex(env.BOSS_CSRF_SECRET, `${identity.email}|${identity.subject}|${window}`);
}

export async function checkCsrf(request, env, identity, token, now = Math.floor(Date.now() / 1000)) {
  if (!env.BOSS_CSRF_SECRET || !env.BOSS_ORIGIN) return { ok: false, status: 503, error: 'CSRF protection is not configured.' };
  const origin = request.headers.get('Origin');
  if (origin !== env.BOSS_ORIGIN) return { ok: false, status: 403, error: 'Cross-origin request refused.' };
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') return { ok: false, status: 403, error: 'Cross-site request refused.' };
  const window = Math.floor(now / WINDOW_SECONDS);
  for (const w of [window, window - 1]) {
    const expected = await hmacHex(env.BOSS_CSRF_SECRET, `${identity.email}|${identity.subject}|${w}`);
    if (safeEqual(expected, token)) return { ok: true };
  }
  return { ok: false, status: 403, error: 'Invalid or expired form token. Reload the page and try again.' };
}
