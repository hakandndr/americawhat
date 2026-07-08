import data from "../data/published.json";
import { slugify } from "./slug.js";

// Enrich each published item with a unique, stable slug.
// Prefer an explicit item.slug; otherwise derive it from the title.
// On collision, append -2, -3, … so every URL stays unique.
const seen = new Map();
export const items = data.items.map((item) => {
  let base = item.slug ? slugify(item.slug) : slugify(item.title);
  if (!base) base = item.id;
  let slug = base;
  const count = seen.get(base) ?? 0;
  if (count > 0) slug = `${base}-${count + 1}`;
  seen.set(base, count + 1);
  return { ...item, slug };
});

const bySlug = new Map(items.map((item) => [item.slug, item]));

export function itemBySlug(slug) {
  return bySlug.get(slug);
}
