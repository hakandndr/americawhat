import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, resetKeyCache } from '../workers/boss/src/auth.mjs';
import { checkCsrf, csrfToken } from '../workers/boss/src/csrf.mjs';
import { AUD, TEAM, jwksFetch, makeSigner } from './helpers/access-jwt.mjs';

const ENV = { BOSS_ACCESS_TEAM_DOMAIN: TEAM, BOSS_ACCESS_AUD: AUD, BOSS_ALLOWED_EMAILS: 'hakan@dndr.net', BOSS_CSRF_SECRET: 'csrf-secret', BOSS_ORIGIN: 'https://boss.americawhat.com' };
const signer = makeSigner();
const other = makeSigner('test-key-1'); // same kid, different key

function req(token, headers = {}) {
  return new Request('https://boss.americawhat.com/', { headers: { ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers } });
}

async function auth(token, env = ENV, opts = {}) {
  resetKeyCache();
  return authenticate(req(token), env, { fetchImpl: jwksFetch(signer.jwk), ...opts });
}

test('a valid assertion for the owner is accepted', async () => {
  const r = await auth(signer.sign());
  assert.equal(r.ok, true);
  assert.equal(r.identity.email, 'hakan@dndr.net');
});

test('missing configuration fails closed with 503', async () => {
  for (const missing of ['BOSS_ACCESS_TEAM_DOMAIN', 'BOSS_ACCESS_AUD', 'BOSS_ALLOWED_EMAILS']) {
    const r = await auth(signer.sign(), { ...ENV, [missing]: '' });
    assert.equal(r.status, 503, missing);
  }
});

test('no assertion, malformed, unsigned, wrong key, wrong algorithm', async () => {
  assert.equal((await auth('')).status, 401);
  assert.equal((await auth('not.a.jwt.at.all')).status, 401);
  assert.equal((await auth('a.b.c')).status, 401);
  const forged = signer.sign().split('.');
  forged[1] = Buffer.from(JSON.stringify({ email: 'hakan@dndr.net', iss: `https://${TEAM}`, aud: [AUD], exp: 9e9 })).toString('base64url');
  assert.equal((await auth(forged.join('.'))).error, 'Invalid signature.');
  assert.equal((await auth(other.sign())).error, 'Invalid signature.');
  assert.equal((await auth(signer.sign({}, { alg: 'HS256' }))).error, 'Unexpected algorithm.');
  assert.equal((await auth(signer.sign({}, { alg: 'none' }))).error, 'Unexpected algorithm.');
});

test('wrong issuer, audience, expired, not yet valid', async () => {
  assert.equal((await auth(signer.sign({ iss: 'https://evil.cloudflareaccess.com' }))).error, 'Wrong issuer.');
  assert.equal((await auth(signer.sign({ aud: ['another-app-audience-000000'] }))).error, 'Wrong audience.');
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await auth(signer.sign({ exp: now - 3600 }))).error, 'Assertion expired.');
  assert.equal((await auth(signer.sign({ nbf: now + 3600 }))).error, 'Assertion not yet valid.');
});

test('another verified identity is forbidden (403)', async () => {
  const r = await auth(signer.sign({ email: 'someone@example.com' }));
  assert.equal(r.status, 403);
});

test('the email header alone is never trusted', async () => {
  resetKeyCache();
  const r = await authenticate(req('', { 'Cf-Access-Authenticated-User-Email': 'hakan@dndr.net' }), ENV, { fetchImpl: jwksFetch(signer.jwk) });
  assert.equal(r.status, 401);
});

test('an unreachable key endpoint fails closed', async () => {
  resetKeyCache();
  const r = await authenticate(req(signer.sign()), ENV, { fetchImpl: async () => new Response('', { status: 500 }) });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

test('CSRF: token bound to identity and window; Origin enforced', async () => {
  const id = { email: 'hakan@dndr.net', subject: 'user-1' };
  const now = 1791976000;
  const token = await csrfToken(ENV, id, now);
  const post = (origin, site) => new Request('https://boss.americawhat.com/review', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), ...(site ? { 'Sec-Fetch-Site': site } : {}) } });
  assert.equal((await checkCsrf(post('https://boss.americawhat.com', 'same-origin'), ENV, id, token, now)).ok, true);
  assert.equal((await checkCsrf(post('https://boss.americawhat.com'), ENV, id, token, now + 12 * 3600)).ok, true, 'previous window accepted');
  assert.equal((await checkCsrf(post('https://boss.americawhat.com'), ENV, id, token, now + 36 * 3600)).ok, false, 'old token refused');
  assert.equal((await checkCsrf(post('https://evil.example'), ENV, id, token, now)).status, 403);
  assert.equal((await checkCsrf(post(null), ENV, id, token, now)).status, 403);
  assert.equal((await checkCsrf(post('https://boss.americawhat.com', 'cross-site'), ENV, id, token, now)).status, 403);
  assert.equal((await checkCsrf(post('https://boss.americawhat.com'), ENV, { ...id, subject: 'other' }, token, now)).ok, false);
  assert.equal((await checkCsrf(post('https://boss.americawhat.com'), { ...ENV, BOSS_CSRF_SECRET: '' }, id, token, now)).status, 503);
});

test('local preview keys are honoured only for ENVIRONMENT=local on loopback', async () => {
  const { localPreviewKeys } = await import('../workers/boss/src/auth.mjs');
  const { apiBase } = await import('../workers/boss/src/github.mjs');
  const jwks = JSON.stringify({ keys: [signer.jwk] });
  const local = new Request('http://127.0.0.1:8788/review');
  const remote = new Request('https://boss.americawhat.com/review');
  assert.ok(localPreviewKeys(local, { ENVIRONMENT: 'local', BOSS_DEV_JWKS: jwks }));
  assert.equal(localPreviewKeys(remote, { ENVIRONMENT: 'local', BOSS_DEV_JWKS: jwks }), null);
  assert.equal(localPreviewKeys(local, { ENVIRONMENT: 'staging', BOSS_DEV_JWKS: jwks }), null);
  assert.equal(localPreviewKeys(local, { ENVIRONMENT: 'production', BOSS_DEV_JWKS: jwks }), null);
  // Production with the variable set still fetches the real team keys (and fails closed here).
  resetKeyCache();
  const r = await authenticate(new Request('https://boss.americawhat.com/', { headers: { 'Cf-Access-Jwt-Assertion': signer.sign() } }),
    { ...ENV, ENVIRONMENT: 'production', BOSS_DEV_JWKS: jwks }, { fetchImpl: async () => new Response('', { status: 500 }) });
  assert.equal(r.status, 503);
  assert.equal(apiBase({ ENVIRONMENT: 'production', BOSS_GITHUB_API_BASE: 'http://127.0.0.1:9999' }), 'https://api.github.com');
  assert.equal(apiBase({ ENVIRONMENT: 'local', BOSS_GITHUB_API_BASE: 'http://evil.example' }), 'https://api.github.com');
  assert.equal(apiBase({ ENVIRONMENT: 'local', BOSS_GITHUB_API_BASE: 'http://127.0.0.1:9999' }), 'http://127.0.0.1:9999');
});
