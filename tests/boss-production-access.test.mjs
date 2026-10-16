// The production Boss with its real committed Access values (team domain, AUD,
// owner email): only an Access assertion for THIS application, signed by the
// team's key, unexpired and for hakan@dndr.net, is let through.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { authenticate, resetKeyCache } from '../workers/boss/src/auth.mjs';
import { createBoss } from '../workers/boss/src/index.mjs';
import { makeSigner } from './helpers/access-jwt.mjs';
import { parseJsonc, STAGING } from '../scripts/release/cf-release.mjs';

const prod = parseJsonc(fs.readFileSync('workers/boss/wrangler.jsonc', 'utf8')).env.production.vars;
const TEAM = prod.BOSS_ACCESS_TEAM_DOMAIN;
const AUD = prod.BOSS_ACCESS_AUD;
const ENV = { ...prod, BOSS_CSRF_SECRET: 'test-only' };
const signer = makeSigner('prod-test-key');
const stranger = makeSigner('prod-test-key'); // same kid, foreign key

const claims = (extra = {}) => ({ iss: `https://${TEAM}`, aud: [AUD], email: 'hakan@dndr.net', ...extra });
const fetched = [];
const jwks = async (url) => {
  fetched.push(String(url));
  return new Response(JSON.stringify({ keys: [signer.jwk] }), { headers: { 'Content-Type': 'application/json' } });
};
const req = (token) => new Request('https://boss.americawhat.com/', { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });
async function auth(token) {
  resetKeyCache();
  return authenticate(req(token), ENV, { fetchImpl: jwks });
}

test('the committed production Access values are the production application', () => {
  assert.equal(TEAM, 'dndrnet.cloudflareaccess.com');
  assert.equal(AUD, '6b54c07908a77fa116828586421b9c338e071caae971854849207bbf84a224fe');
  assert.notEqual(AUD, STAGING.accessAud);
  assert.equal(prod.BOSS_ALLOWED_EMAILS, 'hakan@dndr.net');
  assert.equal(prod.BOSS_ORIGIN, 'https://boss.americawhat.com');
});

test('owner assertion for this application is accepted; keys come from the team certs URL', async () => {
  const r = await auth(signer.sign(claims()));
  assert.equal(r.ok, true);
  assert.equal(r.identity.email, 'hakan@dndr.net');
  assert.equal(fetched.at(-1), 'https://dndrnet.cloudflareaccess.com/cdn-cgi/access/certs');
});

test('issuer, signature, audience, time and email are each enforced', async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await auth('')).status, 401);
  assert.equal((await auth(signer.sign(claims({ aud: [STAGING.accessAud] })))).error, 'Wrong audience.');
  assert.equal((await auth(signer.sign(claims({ iss: 'https://americawhat-test.cloudflareaccess.com' })))).error, 'Wrong issuer.');
  assert.equal((await auth(stranger.sign(claims()))).error, 'Invalid signature.');
  // auth.mjs allows 60 s of clock skew, no more.
  assert.equal((await auth(signer.sign(claims({ exp: now - 120 })))).error, 'Assertion expired.');
  assert.equal((await auth(signer.sign(claims({ exp: undefined })))).error, 'Assertion expired.');
  assert.equal((await auth(signer.sign(claims({ nbf: now + 3600 })))).error, 'Assertion not yet valid.');
  assert.equal((await auth(signer.sign(claims({ email: 'someone@example.com' })))).status, 403);
  assert.equal((await auth(signer.sign(claims(), { alg: 'none' }))).error, 'Unexpected algorithm.');
});

test('the production Boss Worker answers nothing useful without a valid assertion', async () => {
  const boss = createBoss({ fetchImpl: jwks });
  for (const path of ['/', '/analytics', '/published', '/reactions', '/audit', '/health', '/assets/analytics.js']) {
    resetKeyCache();
    const r = await boss.fetch(new Request(`https://boss.americawhat.com${path}`, { headers: { 'Cf-Access-Authenticated-User-Email': 'hakan@dndr.net' } }), ENV);
    assert.equal(r.status, 401, path);
    assert.doesNotMatch(await r.text(), /hakandndr\/americawhat|BOSS_|GITHUB_TOKEN/);
  }
  resetKeyCache();
  const wrongApp = await boss.fetch(new Request('https://boss.americawhat.com/', { headers: { 'Cf-Access-Jwt-Assertion': signer.sign(claims({ aud: [STAGING.accessAud] })) } }), ENV);
  assert.equal(wrongApp.status, 401);
});
