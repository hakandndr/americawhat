import data from "../data/published.json";
import { assignSlugs } from "./slug.js";

// ── Item schema (canonical fields) ───────────────────────────────
// Required:  id, title, comment, category, date
// Source:    sourceName / source_name, sourceUrl / source_url
// Optional:  body, whyAmericaWhat, city, state
// Status:    status/type ∈ { REAL, SUBMITTED, UNVERIFIED }
//            → if omitted, derived: source present ⇒ REAL, else UNVERIFIED
// Fetch:     score, fetchedAt, seenId  (populated by fetch-sources.mjs)
// Runtime:   slug (added below), reactions live server-side (aw_votes.json)
// ─────────────────────────────────────────────────────────────────

// Normalize source field naming (accept both snake_case and camelCase).
function sourceUrlOf(item) {
  return item.sourceUrl ?? item.source_url ?? "";
}

// Enrich each published item with a unique, stable slug + derived status.
const slugs = assignSlugs(data.items);
export const items = data.items.map((item, index) => {
  const slug = slugs[index];
  const status = item.status || item.type || (sourceUrlOf(item) ? "REAL" : "UNVERIFIED");
  return { ...item, slug, status };
});

const bySlug = new Map(items.map((item) => [item.slug, item]));

export function itemBySlug(slug) {
  return bySlug.get(slug);
}

// Publisher domain for display (e.g. "clickorlando.com"). Prefers an explicit
// source_domain; otherwise derives it from the source URL. Returns "" for
// Google News redirects so we never surface "news.google.com".
export function sourceHost(item) {
  const explicit = (item.source_domain || item.sourceDomain || "").trim();
  if (explicit) return explicit.replace(/^www\./i, "");
  const url = item.sourceUrl ?? item.source_url ?? "";
  try {
    const h = new URL(url).hostname.replace(/^www\./i, "");
    return /(^|\.)google\.com$/i.test(h) ? "" : h;
  } catch {
    return "";
  }
}
