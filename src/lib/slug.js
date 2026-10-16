// Turn a title into a URL-safe slug.
export function slugify(title) {
  const words = String(title ?? "")
    .normalize("NFKD")                 // split accents from letters
    .replace(/[̀-ͯ]/g, "")   // strip the accents
    .replace(/['"‘’“”]/g, "") // drop quotes (don't hyphenate)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")       // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, "")           // trim leading/trailing hyphens
    .replace(/-+/g, "-")               // collapse runs of hyphens
    .split("-")
    .filter(Boolean)
    .slice(0, 10)                      // cap to first ~10 words
    .join("-");
  return words;
}

const PINNED = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The URL segment of every item, in list order. An item may carry an explicit
// `slug` that pins its URL (used when a title edit or a deletion would
// otherwise move an existing article); pinned slugs are used verbatim and are
// never handed out to another item. Every other item gets its title slug, with
// "-2", "-3"… for repeats, exactly as before pinning existed.
export function assignSlugs(items) {
  const pinned = new Set(items.map((it) => (typeof it.slug === "string" && PINNED.test(it.slug) ? it.slug : "")).filter(Boolean));
  const seen = new Map();
  const used = new Set();
  return items.map((item) => {
    if (typeof item.slug === "string" && PINNED.test(item.slug) && !used.has(item.slug)) {
      used.add(item.slug);
      return item.slug;
    }
    let base = slugify(item.slug || item.title);
    if (!base) base = item.id;
    let count = seen.get(base) ?? 0;
    let slug;
    do {
      slug = count > 0 ? `${base}-${count + 1}` : base;
      count += 1;
    } while (pinned.has(slug) || used.has(slug));
    seen.set(base, count);
    used.add(slug);
    return slug;
  });
}
