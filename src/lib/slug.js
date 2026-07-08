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
