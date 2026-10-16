import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { cloudflareImport, diffSpecs, parseBind, specFromZone } from '../scripts/release/dns-zone.mjs';

const EXPORT = 'docs/dns/hostinger-export-2026-10-16.zone';
const text = fs.readFileSync(EXPORT, 'utf8');
const zone = parseBind(text);
const inventory = JSON.parse(fs.readFileSync('scripts/release/dns-records.json', 'utf8'));

test('the committed inventory is exactly the owner export (records, values, TTLs)', () => {
  assert.equal(createHash('sha256').update(text).digest('hex'), inventory.exportSha256);
  assert.deepEqual(diffSpecs(inventory.records, specFromZone(zone)), { missing: [], extra: [], valueDiffs: [], ttlDiffs: [] });
  const google = inventory.records.find((r) => r.name === 'zzwor4l5qvov');
  assert.deepEqual([google.type, google.values[0], google.ttl], ['CNAME', 'gv-5bsl4swe37pvva.dv.googlehosted.com', 14400]);
  assert.equal(inventory.records.find((r) => r.type === 'ALIAS').ttl, 300);
});

test('SOA and NS are parsed but never part of the records to copy', () => {
  assert.deepEqual(zone.records.filter((r) => ['SOA', 'NS'].includes(r.type)).map((r) => r.type), ['SOA', 'NS', 'NS']);
  assert.ok(!specFromZone(zone).some((r) => ['SOA', 'NS'].includes(r.type)));
});

test('undotted MX targets are read as absolute names and reported', () => {
  assert.deepEqual(inventory.records.find((r) => r.type === 'MX').values, ['5 mx1.hostinger.com', '10 mx2.hostinger.com']);
  assert.equal(zone.warnings.length, 2);
  assert.match(zone.warnings[0], /mx1\.hostinger\.com\.americawhat\.com/);
});

test('reconcile reports a dropped record, a changed value and a changed TTL', () => {
  const edited = parseBind(text.replace(/^zzwor4l5qvov.*$/m, '').replace('_dmarc                         3600', '_dmarc                         300').replace('45.89.205.38', '45.89.205.39'));
  const d = diffSpecs(inventory.records, specFromZone(edited));
  assert.deepEqual(d.missing, ['zzwor4l5qvov CNAME']);
  assert.match(d.ttlDiffs.join(), /_dmarc TXT: expected 3600 export 300/);
  assert.match(d.valueDiffs.join(), /ftp A/);
});

test('the Cloudflare import file: FQDNs with dots, no SOA/NS, all DNS-only, nothing flattened per record', () => {
  const out = cloudflareImport(zone);
  const lines = out.split('\n').filter((l) => l && !l.startsWith(';'));
  assert.equal(lines.length, 13);
  assert.ok(lines.every((l) => l.endsWith('; cf_tags=cf-proxied:false')));
  assert.doesNotMatch(out, /\bIN (SOA|NS|ALIAS)\b|cf-flatten-cname|cf-proxied:true/);
  assert.match(out, /^americawhat\.com\. 14400 IN MX 5 mx1\.hostinger\.com\. ;/m);
  assert.match(out, /^americawhat\.com\. 300 IN CNAME americawhat\.com\.cdn\.hstgr\.net\. ;/m);
  assert.match(out, /^zzwor4l5qvov\.americawhat\.com\. 14400 IN CNAME gv-5bsl4swe37pvva\.dv\.googlehosted\.com\. ;/m);
  assert.match(out, /^americawhat\.com\. 3600 IN TXT "v=spf1 include:_spf\.mail\.hostinger\.com ~all" ;/m);
  for (const s of ['a', 'b', 'c']) assert.match(out, new RegExp(`^hostingermail-${s}\._domainkey\.americawhat\.com\. 300 IN CNAME hostingermail-${s}\.dkim\.mail\.hostinger\.com\. ;`, 'm'));
});
