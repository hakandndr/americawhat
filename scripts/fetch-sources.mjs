// scripts/fetch-sources.mjs
// americawhat — Phase 6 source-based feed (no dependencies)
// Crawls the RSS sources in sources.json, scores/filters with filters.json,
// adds new candidates to src/data/pending.json. NEVER auto-publishes.
// Copyright: only title + short excerpt + link + source name are taken; full text/images are NOT.
// Uses Node 22 global fetch — no extra packages.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.resolve("src/data");
const SOURCES  = path.join(DATA_DIR, "sources.json");
const FILTERS  = path.join(DATA_DIR, "filters.json");
const PENDING  = path.join(DATA_DIR, "pending.json");
const PUBLISHED= path.join(DATA_DIR, "published.json");
const SEEN     = path.join(DATA_DIR, "seen_ids.json");
const STATUS   = path.join(DATA_DIR, "fetch-status.json");

const UA = "americawhat-fetch/1.0 (+https://americawhat.com)";
const EXCERPT_MAX = 220;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (e) { console.warn("  uyari: " + file + " okunamadi (" + e.message + ")"); return fallback; }
}
function asItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.items)) return data.items;
    return Object.values(data);
  }
  return [];
}

// ---- XML/RSS helpers ----
function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function stripTags(s) {
  let x = decodeEntities(String(s));      // decode entities first (&lt;p&gt; -> <p>)
  x = x.replace(/<[^>]*>/g, " ");         // then strip tags
  x = x.replace(/&[a-z#0-9]+;/gi, " ");   // leftover entities
  return x.replace(/\s+/g, " ").trim();
}
function tag(block, name) {
  const m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i"));
  return m ? m[1].trim() : "";
}
function atomLink(block) {
  const m = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return m ? m[1] : "";
}

function parseFeed(xml) {
  const items = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry[\s>]([\s\S]*?)<\/entry>/gi : /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const b = m[1];
    let title = stripTags(tag(b, "title"));
    let link  = isAtom ? atomLink(b) : stripTags(tag(b, "link"));
    const desc = stripTags(tag(b, "description") || tag(b, "summary") || tag(b, "content"));
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || "";
    // Google News: <source url="https://publisher.com">Publisher</source> + " - Publisher" title suffix
    const srcM = b.match(/<source[^>]*\burl="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    const src = srcM ? stripTags(srcM[2]) : stripTags(tag(b, "source"));
    const publisherUrl = srcM ? srcM[1] : "";
    if (src && title.endsWith(" - " + src)) title = title.slice(0, -(src.length + 3)).trim();
    if (title && link) items.push({ title, link, desc, date, publisher: src, publisherUrl });
  }
  return items;
}

function hasWord(text, kw) {
  const esc = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9])" + esc + "([^a-z0-9]|$)", "i").test(text);
}
function toDateStr(raw) {
  const d = raw ? new Date(raw) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
function seenIdOf(link, title) {
  return "src-" + crypto.createHash("sha1").update((link || title).trim()).digest("hex").slice(0, 12);
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return ""; }
}
function isGoogleHost(h) { return /(^|\.)google\.com$/i.test(h || ""); }
function isTooOld(dateStr, days) {
  if (!days) return false;
  const t = Date.parse(dateStr);
  if (isNaN(t)) return false;
  return Date.now() - t > days * 86400000;
}
function isBlockedDomain(host, list) {
  host = (host || "").toLowerCase();
  if (!host || !list.length) return false;
  return list.some((d) => (d.startsWith(".") ? host.endsWith(d) : host === d || host.endsWith("." + d)));
}

// Best-effort: turn a news.google.com/rss/articles/... link into the real
// publisher article URL. Degrades gracefully — returns "" if it can't.
async function resolveArticle(link) {
  if (!link || !/news\.google\.com/i.test(link)) return "";  // already a real URL
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(link, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (res.url && !/google\.com/i.test(res.url)) { await res.text().catch(() => {}); return res.url; }
    const html = await res.text();
    const m =
      html.match(/<link\s+rel="canonical"\s+href="(https?:\/\/(?!news\.google|www\.google|policies\.google|support\.google|accounts\.google)[^"]+)"/i) ||
      html.match(/data-n-au="(https?:\/\/[^"]+)"/i) ||
      html.match(/<a[^>]+href="(https?:\/\/(?!news\.google|www\.google|policies\.google|support\.google|accounts\.google)[^"]+)"/i);
    if (m) return m[1];
  } catch { /* timeout / network — fall through */ }
  return "";
}

async function fetchText(url) {
  for (let a = 1; a <= 3; a++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * a); continue; }
      if (!res.ok) { console.warn("  HTTP " + res.status + " — atlaniyor"); return ""; }
      return await res.text();
    } catch (e) { console.warn("  " + e.message + " (deneme " + a + "/3)"); await sleep(2000 * a); }
  }
  return "";
}

function scoreItem(text, filters) {
  let score = 0;
  for (const [kw, w] of Object.entries(filters.scoreKeywords || {})) if (hasWord(text, kw)) score += w;
  return score;
}
function isExcluded(text, filters) {
  return (filters.excludeKeywords || []).some((kw) => hasWord(text, kw));
}
function pickCategory(text, fallback, filters) {
  for (const [kw, cat] of Object.entries(filters.categoryHints || {})) if (hasWord(text, kw)) return cat;
  return fallback;
}

async function main() {
  const selftest = process.argv.includes("--selftest");
  const { sources = [] } = await loadJson(SOURCES, { sources: [] });
  const filters = await loadJson(FILTERS, {});
  const pending = asItems(await loadJson(PENDING, []));
  const published = asItems(await loadJson(PUBLISHED, []));
  const seen = new Set(await loadJson(SEEN, []));
  for (const it of pending)   if (it && it.seen_id) seen.add(it.seen_id);
  for (const it of published) if (it && it.seen_id) seen.add(it.seen_id);

  const minScore = filters.minScore ?? 2;
  const maxPer = filters.maxPerSource ?? 12;
  const recencyDays = filters.recencyDays ?? 0;
  const excludeDomains = (filters.excludeDomains || []).map((s) => String(s).toLowerCase());
  const fresh = [];
  const totals = { fetched: 0, added: 0, excluded: 0, duplicate: 0, lowScore: 0 };
  const srcStats = [];

  const feeds = selftest
    ? [{ name: "SELFTEST", defaultCategory: "crime-weird", xml: SELFTEST_XML }]
    : sources.filter((s) => s.enabled !== false && s.type === "rss");

  for (const s of feeds) {
    const xml = selftest ? s.xml : await fetchText(s.url);
    const st = { name: s.name, ok: !!xml, fetched: 0, added: 0, excluded: 0, duplicate: 0, lowScore: 0 };
    if (!xml) { console.log("  " + s.name + ": empty"); srcStats.push(st); continue; }
    const items = parseFeed(xml);
    st.fetched = items.length; totals.fetched += items.length;
    let added = 0;
    for (const raw of items) {
      if (added >= maxPer) break;
      const sid = seenIdOf(raw.link, raw.title);
      if (seen.has(sid)) { st.duplicate++; totals.duplicate++; continue; }
      const text = (raw.title + " " + raw.desc).toLowerCase();
      if (isExcluded(text, filters)) { seen.add(sid); st.excluded++; totals.excluded++; continue; }
      if (isTooOld(raw.date, recencyDays)) { seen.add(sid); st.excluded++; totals.excluded++; continue; }
      const pubHost = hostOf(raw.publisherUrl) || hostOf(raw.link);
      if (isBlockedDomain(pubHost, excludeDomains)) { seen.add(sid); st.excluded++; totals.excluded++; continue; }
      const score = scoreItem(text, filters);
      if (score < minScore) { seen.add(sid); st.lowScore++; totals.lowScore++; continue; }
      seen.add(sid);
      const excerpt = raw.desc ? raw.desc.slice(0, EXCERPT_MAX) : "";
      // Real article URL + publisher domain (builds trust on the card)
      let realUrl = raw.link;
      let domain = hostOf(raw.publisherUrl);           // Google News gives the publisher homepage host
      const resolved = await resolveArticle(raw.link); // best-effort upgrade of the google redirect
      if (resolved && !isGoogleHost(hostOf(resolved))) { realUrl = resolved; if (!domain) domain = hostOf(resolved); }
      if (!domain || isGoogleHost(domain)) { const h = hostOf(realUrl); domain = isGoogleHost(h) ? "" : h; }
      fresh.push({
        id: "aw-p-" + sid.slice(4),
        seen_id: sid,
        title: raw.title.slice(0, 160),
        comment: "",
        excerpt,
        category: pickCategory(text, s.defaultCategory || "only-in-america", filters),
        source_url: "",
        external_url: realUrl,
        source_domain: domain,
        source_name: raw.publisher || s.name,
        date: toDateStr(raw.date),
        score,
        fetched_at: new Date().toISOString(),
      });
      added++; st.added++; totals.added++;
    }
    console.log("  " + s.name + ": +" + added);
    srcStats.push(st);
    if (!selftest) await sleep(1500);
  }

  fresh.sort((a, b) => b.score - a.score);

  if (selftest) { console.log("SELFTEST candidates:\n" + JSON.stringify(fresh, null, 2)); return; }

  // Record run status (always — even when nothing new — so the panel can show it)
  const status = {
    finishedAt: new Date().toISOString(),
    sourcesChecked: feeds.length,
    totals,
    pendingAfter: fresh.length + pending.length,
    sources: srcStats,
  };
  await writeFile(STATUS, JSON.stringify(status, null, 2) + "\n");

  if (fresh.length === 0) {
    console.log("No new candidates.");
    await writeFile(SEEN, JSON.stringify([...seen], null, 2) + "\n");
    return;
  }
  const merged = [...fresh, ...pending];
  await writeFile(PENDING, JSON.stringify(merged, null, 2) + "\n");
  await writeFile(SEEN, JSON.stringify([...seen], null, 2) + "\n");
  console.log(fresh.length + " candidates -> pending.json (total " + merged.length + ").");
}

const SELFTEST_XML = `<?xml version="1.0"?><rss><channel>
<item><title>Florida man arrested after fighting a vending machine - Local10</title><link>https://example.com/a1</link><description>&lt;p&gt;Police said the machine did not press charges.&lt;/p&gt;</description><pubDate>Tue, 07 Jul 2026 10:00:00 GMT</pubDate><source url="https://local10.com">Local10</source></item>
<item><title>Three people killed in highway crash - News</title><link>https://example.com/a2</link><description>A fatal accident.</description><pubDate>Tue, 07 Jul 2026 09:00:00 GMT</pubDate><source url="https://x.com">News</source></item>
<item><title>HOA fines family for leaving trash can out one hour late - WKRG</title><link>https://example.com/a3</link><description>The homeowners association issued a fine.</description><pubDate>Mon, 06 Jul 2026 08:00:00 GMT</pubDate><source url="https://wkrg.com">WKRG</source></item>
</channel></rss>`;

main().catch((e) => { console.error(e); process.exit(1); });
