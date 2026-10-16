#!/usr/bin/env node
// Read-only DNS comparison for the americawhat.com zone move (docs/DNS-READINESS.md).
// Asks the given authoritative nameservers DIRECTLY for every record in
// scripts/release/dns-records.json and reports differences. It sends only DNS
// queries; it never changes a record.
//
//   node scripts/release/dns-compare.mjs                       # Hostinger (current)
//   node scripts/release/dns-compare.mjs --servers <ns1>,<ns2> # e.g. the two Cloudflare-assigned nameservers
//   node scripts/release/dns-compare.mjs --zone-file <BIND export> [--servers ...]
//       expected records taken from a zone export (SOA/NS ignored) instead of dns-records.json
//
// Before the nameserver change run it against the Cloudflare-assigned servers
// of the PENDING zone: every line must be OK (exit 0). The apex alias is
// checked for "answers present and not Cloudflare-proxied".

import fs from 'node:fs';
import { Resolver } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { parseBind, specFromZone } from './dns-zone.mjs';

export const HOSTINGER_NS = ['hermes.dns-parking.com', 'artemis.dns-parking.com'];

// Cloudflare anycast ranges that a PROXIED record would return.
const CLOUDFLARE_V4 = ['104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '188.114.96.0/20', '162.158.0.0/15', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '197.234.240.0/22', '198.41.128.0/17', '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '131.0.72.0/22'];
const ipv4ToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
export function isCloudflareV4(ip) {
  return CLOUDFLARE_V4.some((cidr) => {
    const [base, bits] = cidr.split('/');
    const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
  });
}
export const isCloudflareV6 = (ip) => /^2606:4700:|^2803:f800:|^2405:b500:|^2405:8100:|^2a06:98c0:|^2c0f:f248:/i.test(ip);

const norm = (s) => String(s).trim().toLowerCase().replace(/\.$/, '');

/** Pure comparison of one expected record with the answers a server gave. */
export function compareRecord(expected, answers) {
  if (expected.type === 'ALIAS') {
    const all = [...(answers.A || []), ...(answers.AAAA || [])];
    if (!all.length) return { ok: false, detail: 'no A/AAAA answer for the apex' };
    const proxied = (answers.A || []).filter(isCloudflareV4).concat((answers.AAAA || []).filter(isCloudflareV6));
    if (proxied.length) return { ok: false, detail: `apex answers Cloudflare proxy addresses (${proxied.join(', ')}): turn the proxy OFF` };
    return { ok: true, detail: `${(answers.A || []).length} A / ${(answers.AAAA || []).length} AAAA (CDN alias, addresses rotate)` };
  }
  const want = expected.values.map((v) => (expected.type === 'TXT' ? v : norm(v))).sort();
  const got = (answers[expected.type] || []).map((v) => (expected.type === 'TXT' ? v : norm(v))).sort();
  if (expected.type === 'A') {
    const proxied = got.filter(isCloudflareV4);
    if (proxied.length) return { ok: false, detail: `Cloudflare proxy address ${proxied.join(', ')}: turn the proxy OFF` };
  }
  const ok = JSON.stringify(want) === JSON.stringify(got);
  return { ok, detail: ok ? got.join(' | ') : `expected [${want.join(' | ')}] got [${got.join(' | ') || 'nothing'}]` };
}

async function serverIps(names) {
  const sys = new Resolver();
  const ips = [];
  for (const n of names) ips.push(...(await sys.resolve4(n)));
  return ips;
}

async function query(resolver, fqdn, type) {
  try {
    if (type === 'MX') return (await resolver.resolveMx(fqdn)).map((m) => `${m.priority} ${m.exchange}`);
    if (type === 'TXT') return (await resolver.resolveTxt(fqdn)).map((chunks) => chunks.join(''));
    if (type === 'CNAME') return await resolver.resolveCname(fqdn);
    if (type === 'A') return await resolver.resolve4(fqdn);
    if (type === 'AAAA') return await resolver.resolve6(fqdn);
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND'].includes(error.code)) return [];
    throw error;
  }
  return [];
}

export async function compareZone({ servers = HOSTINGER_NS, spec }) {
  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  resolver.setServers(await serverIps(servers));
  const rows = [];
  for (const rec of spec.records) {
    const fqdn = rec.name === '@' ? spec.zone : `${rec.name}.${spec.zone}`;
    const types = rec.type === 'ALIAS' ? ['A', 'AAAA'] : [rec.type];
    const answers = {};
    for (const t of types) answers[t] = await query(resolver, fqdn, t);
    rows.push({ name: fqdn, type: rec.type, role: rec.role, ...compareRecord(rec, answers) });
  }
  // A name that must not exist yet, and the wildcard probe.
  for (const [label, fqdn] of [['boss (must not exist before cutover)', `boss.${spec.zone}`], ['wildcard probe', `zz-probe-${Date.now()}.${spec.zone}`]]) {
    const a = await query(resolver, fqdn, 'A');
    const c = await query(resolver, fqdn, 'CNAME');
    rows.push({ name: fqdn, type: 'absent', role: label, ok: !a.length && !c.length, detail: a.length || c.length ? `unexpected answer ${[...a, ...c].join(', ')}` : 'NXDOMAIN/empty' });
  }
  return { servers, ok: rows.every((r) => r.ok), rows };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--servers');
  const servers = i >= 0 ? argv[i + 1].split(',') : HOSTINGER_NS;
  const z = argv.indexOf('--zone-file');
  let spec;
  if (z >= 0) {
    const zone = parseBind(fs.readFileSync(argv[z + 1], 'utf8'));
    spec = { zone: zone.origin, records: specFromZone(zone) };
  } else spec = JSON.parse(fs.readFileSync(new URL('./dns-records.json', import.meta.url), 'utf8'));
  const result = await compareZone({ servers, spec });
  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`servers: ${servers.join(', ')}`);
    for (const r of result.rows) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.type.padEnd(6)} ${r.name.padEnd(45)} ${r.detail}`);
    console.log(result.ok ? 'RESULT: all records match' : 'RESULT: differences found — do NOT change nameservers');
  }
  process.exit(result.ok ? 0 : 1);
}
