// scripts/fetch-reddit.mjs
// americawhat — Faz 2 otomatik besleme (AUTH'SUZ sürüm)
// Küratörlü subreddit'lerin PUBLIC .json endpoint'lerinden top gönderileri çeker,
// yeni adayları src/data/pending.json'a ekler.
// Bağımlılık YOK, Reddit app / client_id / secret GEREKMEZ. Sadece Node fetch + iyi bir User-Agent.
// Not: public endpoint rate-limit'e biraz hassastır; subreddit'ler arası bekleme + retry ile yumuşatıldı.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// Reddit jenerik UA'ları throttle eder; açıklayıcı bir UA şart.
const USER_AGENT =
  "web:americawhat:v0.2 (by /u/HakanDundar; +https://americawhat.com)";

// subreddit -> geçici kategori (panelde sen değiştirirsin)
const SOURCES = [
  { sub: "FloridaMan", category: "florida-man" },
  { sub: "nottheonion", category: "wait-what" },
  { sub: "LateStageCapitalism", category: "late-stage" },
  { sub: "mildlyinfuriating", category: "bureaucracy" },
  { sub: "ABoringDystopia", category: "only-in-america" },
  { sub: "facepalm", category: "crime-weird" },
];

const PER_SUB = 25;
const TIME = "day";
const MIN_SCORE = 500;
const MAX_TITLE = 140;
const MIN_TITLE = 8;
const SUB_DELAY_MS = 2500;
const MAX_RETRY = 3;

const DATA_DIR = path.resolve("src/data");
const PENDING = path.join(DATA_DIR, "pending.json");
const PUBLISHED = path.join(DATA_DIR, "published.json");
const SEEN = path.join(DATA_DIR, "seen_ids.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    console.warn("  uyari: " + file + " okunamadi (" + e.message + "), fallback");
    return fallback;
  }
}

async function fetchSub(sub) {
  const url = "https://www.reddit.com/r/" + sub + "/top.json?t=" + TIME + "&limit=" + PER_SUB + "&raw_json=1";
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = 3000 * attempt;
        console.warn("  r/" + sub + ": HTTP " + res.status + ", " + wait + "ms sonra tekrar (" + attempt + "/" + MAX_RETRY + ")");
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        console.warn("  r/" + sub + ": HTTP " + res.status + ", atlaniyor");
        return [];
      }
      const j = await res.json();
      return (j && j.data && j.data.children ? j.data.children.map((c) => c.data) : []);
    } catch (e) {
      const wait = 3000 * attempt;
      console.warn("  r/" + sub + ": " + e.message + ", " + wait + "ms sonra tekrar (" + attempt + "/" + MAX_RETRY + ")");
      await sleep(wait);
    }
  }
  console.warn("  r/" + sub + ": " + MAX_RETRY + " denemede alinamadi, atlaniyor");
  return [];
}

function isJunk(p) {
  if (p.over_18) return true;
  if (p.stickied || p.pinned) return true;
  if (p.removed_by_category) return true;
  if ((p.score ?? 0) < MIN_SCORE) return true;
  const t = (p.title ?? "").trim();
  if (t.length < MIN_TITLE || t.length > MAX_TITLE) return true;
  return false;
}

function toItem(p, category) {
  const external =
    p.url && !p.url.includes("reddit.com") && !p.is_self ? p.url : null;
  const created = (p.created_utc ?? Date.now() / 1000) * 1000;
  return {
    id: "aw-p-" + p.id,
    reddit_id: p.id,
    title: p.title.trim(),
    comment: "",
    category,
    source_url: "https://www.reddit.com" + p.permalink,
    external_url: external,
    source_name: "r/" + p.subreddit,
    date: new Date(created).toISOString().slice(0, 10),
    score: p.score ?? 0,
    fetched_at: new Date().toISOString(),
  };
}

async function main() {
  const pending = await loadJson(PENDING, []);
  const published = await loadJson(PUBLISHED, []);
  const seen = new Set(await loadJson(SEEN, []));

  for (const it of pending) if (it.reddit_id) seen.add(it.reddit_id);
  for (const it of published) if (it.reddit_id) seen.add(it.reddit_id);

  const fresh = [];
  for (const { sub, category } of SOURCES) {
    const posts = await fetchSub(sub);
    let added = 0;
    for (const p of posts) {
      if (!p?.id || seen.has(p.id)) continue;
      if (isJunk(p)) continue;
      seen.add(p.id);
      fresh.push(toItem(p, category));
      added++;
    }
    console.log("  r/" + sub + ": +" + added);
    await sleep(SUB_DELAY_MS);
  }

  if (fresh.length === 0) {
    console.log("Yeni aday yok.");
    await writeFile(SEEN, JSON.stringify([...seen], null, 2) + "\n");
    return;
  }

  const merged = [...fresh, ...pending];
  await writeFile(PENDING, JSON.stringify(merged, null, 2) + "\n");
  await writeFile(SEEN, JSON.stringify([...seen], null, 2) + "\n");
  console.log(fresh.length + " aday eklendi -> pending.json (toplam " + merged.length + ").");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
