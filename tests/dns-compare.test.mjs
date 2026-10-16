import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareRecord, isCloudflareV4 } from '../scripts/release/dns-compare.mjs';

const spec = JSON.parse(fs.readFileSync('scripts/release/dns-records.json', 'utf8'));
const rec = (name, type) => spec.records.find((r) => r.name === name && r.type === type);

test('the record spec keeps every Hostinger email record', () => {
  assert.deepEqual(rec('@', 'MX').values, ['5 mx1.hostinger.com', '10 mx2.hostinger.com']);
  assert.match(rec('@', 'TXT').values[0], /^v=spf1 include:_spf\.mail\.hostinger\.com/);
  assert.ok(rec('_dmarc', 'TXT'));
  for (const s of ['a', 'b', 'c']) assert.equal(rec(`hostingermail-${s}._domainkey`, 'CNAME').values[0], `hostingermail-${s}.dkim.mail.hostinger.com`);
});

test('exact matches pass; missing, changed or proxied records fail', () => {
  assert.equal(compareRecord(rec('@', 'MX'), { MX: ['10 mx2.hostinger.com.', '5 MX1.hostinger.com'] }).ok, true);
  assert.equal(compareRecord(rec('@', 'MX'), { MX: ['5 mx1.hostinger.com'] }).ok, false);
  assert.equal(compareRecord(rec('@', 'TXT'), { TXT: ['v=spf1 include:_spf.mail.hostinger.com -all'] }).ok, false);
  assert.equal(compareRecord(rec('ftp', 'A'), { A: ['104.21.3.4'] }).ok, false);
  assert.match(compareRecord(rec('ftp', 'A'), { A: ['172.67.1.1'] }).detail, /proxy OFF/);
  const alias = rec('@', 'ALIAS');
  assert.equal(compareRecord(alias, { A: ['147.79.120.184'], AAAA: ['2a02:4780:51::1'] }).ok, true);
  assert.equal(compareRecord(alias, { A: [], AAAA: [] }).ok, false);
  assert.match(compareRecord(alias, { A: ['104.16.1.1'], AAAA: [] }).detail, /proxy OFF/);
  assert.match(compareRecord(alias, { A: [], AAAA: ['2606:4700::1'] }).detail, /proxy OFF/);
  assert.equal(isCloudflareV4('45.89.205.38'), false);
});
