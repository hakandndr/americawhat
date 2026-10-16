#!/usr/bin/env node
// Works on the owner's BIND export of the Hostinger zone
// (docs/dns/hostinger-export-*.zone). Local only: reads files, prints text.
//
//   node scripts/release/dns-zone.mjs reconcile <zone file>
//       Compares the export with scripts/release/dns-records.json (names,
//       types, values, TTLs). Exit 1 on any difference.
//   node scripts/release/dns-zone.mjs spec <zone file>
//       Prints the dns-records.json content derived from the export.
//   node scripts/release/dns-zone.mjs cloudflare <zone file>
//       Prints a Cloudflare import file: fully qualified names, no SOA/NS
//       (Cloudflare assigns its own), ALIAS at the apex written as CNAME
//       (Cloudflare flattens only the apex), every record cf-proxied:false and
//       no cf-flatten-cname tag, so verification and DKIM CNAMEs stay CNAMEs.

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Provider records: never copied, the new DNS host publishes its own.
export const PROVIDER_TYPES = new Set(['SOA', 'NS']);
const TARGET_TYPES = new Set(['CNAME', 'ALIAS', 'MX', 'NS']);

const stripDot = (s) => s.replace(/\.$/, '');

/** Tokenizes one line, keeping quoted strings together and dropping ; comments. */
function tokens(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ';') break;
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < line.length && line[j] !== '"') { if (line[j] === '\\') j++; s += line[j]; j++; }
      out.push({ quoted: true, text: s });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < line.length && !/\s/.test(line[j]) && line[j] !== ';') j++;
    out.push({ quoted: false, text: line.slice(i, j) });
    i = j;
  }
  return out;
}

/**
 * Parses the BIND subset Hostinger exports ($ORIGIN, $TTL, "@", a blank owner
 * continuing the previous name, optional TTL and class, quoted TXT).
 * Targets without a trailing dot are taken as ABSOLUTE names when they contain
 * a dot (Hostinger writes `mx1.hostinger.com` undotted; strict BIND would
 * append the origin). Such targets are listed in `warnings`.
 */
export function parseBind(text) {
  let origin = '';
  let defaultTtl = 3600;
  let last = null;
  const records = [];
  const warnings = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const startsBlank = /^\s/.test(raw);
    const t = tokens(raw);
    if (!t.length) continue;
    if (t[0].text === '$ORIGIN') { origin = stripDot(t[1].text).toLowerCase(); continue; }
    if (t[0].text === '$TTL') { defaultTtl = Number(t[1].text); continue; }
    let k = 0;
    let name = last;
    if (!startsBlank) { name = t[0].text; k = 1; }
    if (name === null) throw new Error(`record without owner: ${raw}`);
    let ttl = defaultTtl;
    if (/^\d+$/.test(t[k]?.text)) { ttl = Number(t[k].text); k++; }
    if (t[k]?.text.toUpperCase() === 'IN') k++;
    const type = t[k].text.toUpperCase();
    const rdata = t.slice(k + 1);
    last = name;
    const owner = name === '@' ? '@' : stripDot(name.toLowerCase().endsWith(`.${origin}.`) ? name.slice(0, -(origin.length + 2)) : name).toLowerCase();
    let value;
    if (type === 'TXT') value = rdata.map((x) => x.text).join('');
    else if (type === 'MX') value = `${rdata[0].text} ${normTarget(rdata[1].text, origin, warnings, owner, type)}`;
    else if (TARGET_TYPES.has(type)) value = normTarget(rdata[0].text, origin, warnings, owner, type);
    else value = rdata.map((x) => x.text).join(' ');
    records.push({ name: owner, type, ttl, value });
  }
  return { origin, defaultTtl, records, warnings };
}

function normTarget(target, origin, warnings, owner, type) {
  if (target.endsWith('.')) return stripDot(target).toLowerCase();
  if (target === '@') return origin;
  if (target.includes('.')) {
    warnings.push(`${owner} ${type}: target "${target}" has no trailing dot; read as absolute ${target} (strict BIND would read ${target}.${origin})`);
    return target.toLowerCase();
  }
  return `${target}.${origin}`.toLowerCase();
}

/** Groups the zone into the dns-records.json record list (provider records left out). */
export function specFromZone(zone, roles = {}) {
  const groups = new Map();
  for (const r of zone.records) {
    if (PROVIDER_TYPES.has(r.type)) continue;
    const key = `${r.name} ${r.type}`;
    if (!groups.has(key)) groups.set(key, { name: r.name, type: r.type, values: [], ttl: r.ttl, role: roles[key] || '' });
    const g = groups.get(key);
    g.values.push(r.value);
    if (g.ttl !== r.ttl) throw new Error(`${key}: different TTLs in one record set`);
  }
  return [...groups.values()];
}

/** Differences between two record lists (dns-records.json shape). */
export function diffSpecs(expected, actual) {
  const key = (r) => `${r.name} ${r.type}`;
  const norm = (r) => [...r.values].map((v) => (r.type === 'TXT' ? v : v.toLowerCase())).sort();
  const a = new Map(actual.map((r) => [key(r), r]));
  const e = new Map(expected.map((r) => [key(r), r]));
  const out = { missing: [], extra: [], valueDiffs: [], ttlDiffs: [] };
  for (const [k, r] of e) {
    const got = a.get(k);
    if (!got) { out.missing.push(k); continue; }
    if (JSON.stringify(norm(r)) !== JSON.stringify(norm(got))) out.valueDiffs.push(`${k}: expected [${norm(r).join(' | ')}] export [${norm(got).join(' | ')}]`);
    if (r.ttl !== got.ttl) out.ttlDiffs.push(`${k}: expected ${r.ttl} export ${got.ttl}`);
  }
  for (const k of a.keys()) if (!e.has(k)) out.extra.push(k);
  return out;
}

/** Cloudflare import file. Every record DNS-only; no flattening tag. */
export function cloudflareImport(zone) {
  const fq = (name) => (name === '@' ? `${zone.origin}.` : `${name}.${zone.origin}.`);
  const lines = [`; americawhat.com records for a Cloudflare import (generated from the Hostinger export).`, `; SOA and NS are omitted: Cloudflare publishes its own.`];
  for (const r of zone.records) {
    if (PROVIDER_TYPES.has(r.type)) continue;
    const type = r.type === 'ALIAS' ? 'CNAME' : r.type;
    let value;
    if (type === 'TXT') value = `"${r.value.replace(/"/g, '\\"')}"`;
    else if (type === 'MX') { const [prio, host] = r.value.split(' '); value = `${prio} ${host}.`; }
    else if (type === 'CNAME') value = `${r.value}.`;
    else value = r.value;
    lines.push(`${fq(r.name)} ${r.ttl} IN ${type} ${value} ; cf_tags=cf-proxied:false`);
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [command, file] = process.argv.slice(2);
  if (!command || !file) { console.error('usage: dns-zone.mjs reconcile|spec|cloudflare <zone file>'); process.exit(2); }
  const text = fs.readFileSync(file, 'utf8');
  const zone = parseBind(text);
  const specPath = new URL('./dns-records.json', import.meta.url);
  const current = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (command === 'cloudflare') { process.stdout.write(cloudflareImport(zone)); process.exit(0); }
  if (command === 'spec') {
    const roles = Object.fromEntries(current.records.map((r) => [`${r.name} ${r.type}`, r.role]));
    const sha = createHash('sha256').update(text).digest('hex');
    console.log(JSON.stringify({ ...current, exportSha256: sha, records: specFromZone(zone, roles) }, null, 2));
    process.exit(0);
  }
  if (command === 'reconcile') {
    const d = diffSpecs(current.records, specFromZone(zone));
    const provider = zone.records.filter((r) => PROVIDER_TYPES.has(r.type)).map((r) => `${r.name} ${r.type} ${r.value}`);
    console.log(JSON.stringify({ origin: zone.origin, records: zone.records.length, providerRecordsNotCopied: provider, warnings: zone.warnings, ...d }, null, 2));
    process.exit(d.missing.length + d.extra.length + d.valueDiffs.length + d.ttlDiffs.length ? 1 : 0);
  }
  console.error(`unknown command ${command}`);
  process.exit(2);
}
