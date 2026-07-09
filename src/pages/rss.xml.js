import { items } from "../lib/items.js";

const SITE = "https://americawhat.com";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function GET() {
  const sorted = [...items]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 50);

  const entries = sorted
    .map((it) => {
      const link = `${SITE}/item/${it.slug}/`;
      const desc = it.comment || it.body || it.title;
      const pub = it.date
        ? new Date(it.date).toUTCString()
        : new Date().toUTCString();
      return `    <item>
      <title>${esc(it.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <category>${esc(it.category)}</category>
      <description>${esc(desc)}</description>
      <pubDate>${pub}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>americawhat — wait, what</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>A curated running feed of absurd, deeply-American moments.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${entries}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
