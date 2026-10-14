// Signs Cloudflare-Access-shaped RS256 JWTs with a locally generated key, for tests.
import { generateKeyPairSync, createSign } from 'node:crypto';

export const TEAM = 'americawhat-test.cloudflareaccess.com';
export const AUD = 'aud-0123456789abcdef0123456789abcdef';

export function makeSigner(kid = 'test-key-1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  function sign(claims = {}, header = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: `https://${TEAM}`, aud: [AUD], email: 'hakan@dndr.net', sub: 'user-1', iat: now, nbf: now, exp: now + 3600, ...claims };
    const head = { alg: 'RS256', kid, typ: 'JWT', ...header };
    const input = `${b64(head)}.${b64(payload)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(input);
    return `${input}.${signer.sign(privateKey).toString('base64url')}`;
  }
  return { jwk, sign };
}

export function jwksFetch(...jwks) {
  return async () => new Response(JSON.stringify({ keys: jwks }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
