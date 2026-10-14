#!/usr/bin/env node
// Read-only parity check between the local build (dist/) and a live origin.
// It only sends GET requests for public pages; it never calls /analytics/*
// endpoints, so no visit or vote is recorded on the live site.
//
//   node scripts/parity/compare-live.mjs [https://americawhat.com] [--pages 40]
//
// Compares: the sitemap URL set, and for a sample of pages the canonical URL,
// <title>, og:image and the presence of Article JSON-LD on item pages.

import fs from 'node:fs';
import path from 'node:path';

const base = (process.argv.find((a) => a.startsWith('http')) || 'https://americawhat.com').replace(/\/$/, '');
const sampleSize = Number(process.argv[process.argv.indexOf('--pages') + 1]) || 40;
const DIST = path.resolve('dist');
const UA = 'americawhat-parity-check/1.0 (read-only)';

function locs(xml) { return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]); }
function meta(html) {
  const pick = (re) => (re.exec(html) || [])[1] || '';
  return {
    canonical: pick(/<link rel="canonical" href="([^"]+)"/),
    title: pick(/<title>([^<]*)<\/title>/),
    ogImage: pick(/<meta property="og:image" content="([^"]+)"/),
    jsonLdArticle: /"@type":\s*"(?:NewsArticle|Article)"/.test(html),
  };
}
async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location'), text: res.status === 200 ? await res.text() : '' };
}

const localSitemap = locs(fs.readFileSync(path.join(DIST, 'sitemap-0.xml'), 'utf8'));
const liveIndex = await get(`${base}/sitemap-index.xml`);
const liveSitemaps = locs(liveIndex.text);
const live = [];
for (const sm of liveSitemaps) live.push(...locs((await get(sm.replace('https://americawhat.com', base))).text));

const L = new Set(localSitemap);
const R = new Set(live);
const onlyLocal = localSitemap.filter((u) => !R.has(u));
const onlyLive = live.filter((u) => !L.has(u));

const sample = localSitemap.filter((u) => R.has(u)).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / sampleSize)) === 0).slice(0, sampleSize);
const mismatches = [];
for (const url of sample) {
  const rel = new URL(url).pathname;
  const file = path.join(DIST, rel, 'index.html');
  const localHtml = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const liveRes = await get(url.replace('https://americawhat.com', base));
  const a = meta(localHtml);
  const b = meta(liveRes.text);
  for (const k of Object.keys(a)) if (a[k] !== b[k]) mismatches.push({ url: rel, field: k, local: a[k], live: b[k] });
  if (liveRes.status !== 200) mismatches.push({ url: rel, field: 'status', local: 200, live: liveRes.status });
}

const slash = await get(`${base}/about`);
const report = {
  base,
  sitemap: { local: localSitemap.length, live: live.length, onlyLocal, onlyLive },
  sampledPages: sample.length,
  metaMismatches: mismatches,
  trailingSlash: { status: slash.status, location: slash.location },
};
console.log(JSON.stringify(report, null, 2));
process.exit(onlyLive.length || mismatches.length ? 1 : 0);
