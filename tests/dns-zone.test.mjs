import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { cloudflareImport, diffSpecs, parseBind, specFromZone } from '../scripts/release/dns-zone.mjs';

// Current zone (Hostinger CDN disabled) and the earlier CDN-based export.
const EXPORT = 'docs/dns/hostinger-export-2026-10-16-no-cdn.zone';
const CDN_EXPORT = 'docs/dns/hostinger-export-2026-10-16.zone';
const IMPORT_FILE = 'docs/dns/cloudflare-import-2026-10-16.txt';
const text = fs.readFileSync(EXPORT, 'utf8');
const zone = parseBind(text);
const inventory = JSON.parse(fs.readFileSync('scripts/release/dns-records.json', 'utf8'));
const find = (name, type) => inventory.records.find((r) => r.name === name && r.type === type);

test('the committed inventory is exactly the current owner export (records, values, TTLs)', () => {
  assert.equal(createHash('sha256').update(text).digest('hex'), inventory.exportSha256);
  assert.deepEqual(diffSpecs(inventory.records, specFromZone(zone)), { missing: [], extra: [], valueDiffs: [], ttlDiffs: [] });
  const google = find('zzwor4l5qvov', 'CNAME');
  assert.deepEqual([google.values[0], google.ttl], ['gv-5bsl4swe37pvva.dv.googlehosted.com', 14400]);
  assert.ok(!inventory.records.some((r) => r.type === 'ALIAS'), 'no Hostinger CDN alias left');
  assert.deepEqual([find('@', 'A').values, find('@', 'A').ttl], [['45.89.205.38'], 1800]);
  assert.deepEqual([find('@', 'AAAA').values, find('@', 'AAAA').ttl], [['2a02:4780:1:2242:0:145e:6975:6'], 1800]);
  assert.deepEqual(find('www', 'CNAME').values, ['americawhat.com']);
});

test('disabling Hostinger CDN changed only the web rows', () => {
  const before = specFromZone(parseBind(fs.readFileSync(CDN_EXPORT, 'utf8')));
  assert.deepEqual(diffSpecs(before, inventory.records), {
    missing: ['@ ALIAS'],
    extra: ['@ A', '@ AAAA'],
    valueDiffs: ['www CNAME: expected [www.americawhat.com.cdn.hstgr.net] export [americawhat.com]'],
    ttlDiffs: [],
  });
});

test('SOA and NS are parsed but never part of the records to copy', () => {
  assert.deepEqual(zone.records.filter((r) => ['SOA', 'NS'].includes(r.type)).map((r) => r.type), ['SOA', 'NS', 'NS']);
  assert.ok(!specFromZone(zone).some((r) => ['SOA', 'NS'].includes(r.type)));
});

test('undotted MX targets are read as absolute names and reported', () => {
  assert.deepEqual(find('@', 'MX').values, ['5 mx1.hostinger.com', '10 mx2.hostinger.com']);
  assert.equal(zone.warnings.length, 2);
  assert.match(zone.warnings[0], /mx1\.hostinger\.com\.americawhat\.com/);
});

test('reconcile reports a dropped record, a changed value and a changed TTL', () => {
  const edited = parseBind(text
    .replace(/^zzwor4l5qvov.*$/m, '')
    .replace('_dmarc                         3600', '_dmarc                         300')
    .replace(/^(ftp\s.*)45\.89\.205\.38$/m, '$145.89.205.39'));
  const d = diffSpecs(inventory.records, specFromZone(edited));
  assert.deepEqual(d.missing, ['zzwor4l5qvov CNAME']);
  assert.match(d.ttlDiffs.join(), /_dmarc TXT: expected 3600 export 300/);
  assert.match(d.valueDiffs.join(), /^ftp A/);
});

test('the Cloudflare import file: FQDNs with dots, no SOA/NS, all DNS-only, nothing flattened per record', () => {
  const out = cloudflareImport(zone);
  assert.equal(fs.readFileSync(IMPORT_FILE, 'utf8').replace(/\r\n/g, '\n'), out, 'committed import file is the generator output');
  const lines = out.split('\n').filter((l) => l && !l.startsWith(';'));
  assert.equal(lines.length, 14);
  assert.ok(lines.every((l) => l.endsWith('; cf_tags=cf-proxied:false')));
  assert.doesNotMatch(out, /\bIN (SOA|NS|ALIAS)\b|cf-flatten-cname|cf-proxied:true|hstgr/);
  assert.match(out, /^americawhat\.com\. 1800 IN A 45\.89\.205\.38 ;/m);
  assert.match(out, /^americawhat\.com\. 1800 IN AAAA 2a02:4780:1:2242:0:145e:6975:6 ;/m);
  assert.match(out, /^www\.americawhat\.com\. 300 IN CNAME americawhat\.com\. ;/m);
  assert.match(out, /^americawhat\.com\. 14400 IN MX 5 mx1\.hostinger\.com\. ;/m);
  assert.match(out, /^americawhat\.com\. 14400 IN MX 10 mx2\.hostinger\.com\. ;/m);
  assert.match(out, /^zzwor4l5qvov\.americawhat\.com\. 14400 IN CNAME gv-5bsl4swe37pvva\.dv\.googlehosted\.com\. ;/m);
  assert.match(out, /^americawhat\.com\. 3600 IN TXT "v=spf1 include:_spf\.mail\.hostinger\.com ~all" ;/m);
  for (const s of ['a', 'b', 'c']) {
    assert.match(out, new RegExp(`^hostingermail-${s}\\._domainkey\\.americawhat\\.com\\. 300 IN CNAME hostingermail-${s}\\.dkim\\.mail\\.hostinger\\.com\\. ;`, 'm'));
  }
});
