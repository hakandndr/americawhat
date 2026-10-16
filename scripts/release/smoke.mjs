#!/usr/bin/env node
// HTTP smoke test of a deployed americawhat-web (staging, or production after
// an approved cutover). Read checks only, unless --write is given; --write
// sends one reaction and one page view, which is acceptable on staging only.
//
//   node scripts/release/smoke.mjs https://americawhat-web-staging.hakan-c89.workers.dev [--write]

const base = (process.argv[2] || '').replace(/\/$/, '');
const write = process.argv.includes('--write');
if (!/^https:\/\//.test(base)) { console.error('usage: smoke.mjs <https://origin> [--write]'); process.exit(2); }
if (write && /(^|\.)americawhat\.com$/.test(new URL(base).hostname)) { console.error('--write is refused on the production hostname'); process.exit(2); }

const results = [];
async function check(name, fn) {
  try { const r = await fn(); results.push([r === true ? 'PASS' : `FAIL ${r}`, name]); } catch (e) { results.push([`FAIL ${e.message}`, name]); }
}
const get = (p, init = {}) => fetch(`${base}${p}`, { redirect: 'manual', ...init });

await check('home 200 html', async () => { const r = await get('/'); return r.status === 200 && (r.headers.get('content-type') || '').includes('text/html') || r.status; });
await check('item page 200', async () => { const html = await (await get('/')).text(); const m = /href="(\/item\/[^"]+\/)"/.exec(html); const r = await get(m[1]); return r.status === 200 || r.status; });
await check('/about -> 301 /about/', async () => { const r = await get('/about'); return (r.status === 301 && new URL(r.headers.get('location'), base).pathname === '/about/') || `${r.status} ${r.headers.get('location')}`; });
await check('404 page is 404', async () => (await get('/no-such-page/')).status === 404 || 'not 404');
for (const p of ['/rss.xml', '/sitemap-index.xml', '/robots.txt', '/og/default.png']) await check(`${p} 200`, async () => (await get(p)).status === 200 || 'not 200');
for (const p of ['/analytics/aw_votes.json', '/analytics/aw_panel_log.txt', '/studio/index.php', '/studio/config.sample.php', '/.htaccess', '/analytics/.htaccess', '/boss/', '/.assetsignore', '/_headers'])
  await check(`${p} not served`, async () => { const r = await get(p); const body = await r.text(); return (r.status === 404 && !body.includes('<?php')) || r.status; });
await check('security headers', async () => {
  const r = await get('/');
  const need = ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security', 'permissions-policy'];
  const missing = need.filter((h) => !r.headers.get(h));
  return missing.length === 0 || `missing ${missing.join(',')}`;
});
await check('health ok', async () => { const r = await get('/api/health'); const j = await r.json(); return (r.status === 200 && j.status === 'ok') || JSON.stringify(j.checks); });
if (process.env.EXPECTED_RELEASE) await check('expected production release is serving', async () => {
  const r = await get('/api/health', { cache: 'no-store' });
  const j = await r.json();
  return r.status === 200 && j.environment === 'production' && j.release === process.env.EXPECTED_RELEASE || `unexpected release ${j.release}`;
});
await check('GET never writes (vote.php GET -> 405, log_df GET -> 204)', async () => {
  const a = await get('/analytics/vote.php?id=aw-0001&reaction=wat');
  const b = await get('/analytics/log_df.php?path=/');
  return (a.status === 405 && b.status === 204) || `${a.status}/${b.status}`;
});
await check('cross-origin POST refused', async () => (await get('/analytics/vote.php', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'id=aw-0135&reaction=wat' })).status === 403 || 'not 403');
if (write) {
  await check('reaction counts once per address/day', async () => {
    const post = () => get('/analytics/vote.php', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'id=aw-0135&reaction=same' }).then((r) => r.json());
    const a = await post();
    const b = await post();
    return (a.status === 'ok' && b.status === 'ok' && b.counted === false) || JSON.stringify([a, b]);
  });
  await check('page view beacon stored (idempotent id)', async () => {
    const body = `path=%2Fsmoke%2F&referrer=&evt=${crypto.randomUUID()}`;
    const key = process.env.AW_STAGING_TEST_KEY || '';
    const send = (withKey) => get('/analytics/log_df.php', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded', ...(withKey ? { 'X-AW-Test-Key': key } : {}) }, body });
    const anonymous = await send(false);
    if (anonymous.status !== 202) return `a real visitor's view was not refused on staging (${anonymous.status})`;
    if (!key) return 'set AW_STAGING_TEST_KEY to test the stored path';
    const a = await send(true);
    const b = await send(true);
    return (a.status === 200 && b.status === 200) || `${a.status}/${b.status}`;
  });
}
for (const [outcome, name] of results) console.log(`${outcome.padEnd(6)} ${name}`);
process.exit(results.every(([o]) => o === 'PASS') ? 0 : 1);
