// ── Trending: top-5 by total reactions ──
// On the Worker the strip arrives filled (data-trending="edge"); this script
// then only refreshes the numbers in place, never adding, removing or
// reordering rows, so nothing below the strip moves. "none" means the
// Worker found too little signal. "unavailable" (the Worker could not read
// D1 and had nothing cached) and a missing attribute (plain static file) build
// the strip here as the static site always did.
export function initTrending(window) {
  const { document } = window;
  const fetch = window.fetch.bind(window);
  const sec = document.getElementById("trending");
  const ol = document.getElementById("trending-list");
  if (!sec || !ol) return Promise.resolve();
  const totalOf = (counts) => Object.values(counts || {}).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const mode = sec.getAttribute("data-trending");
  if (mode === "edge") return refreshCounts();
  if (mode === "none") return Promise.resolve();
  return buildStatic();

  async function readCounts(ids) {
    const res = await fetch("/analytics/get_votes.php?ids=" + ids.join(","));
    return (await res.json()) || {};
  }

  async function refreshCounts() {
    const rows = [...ol.querySelectorAll("li[data-id]")];
    if (!rows.length) return;
    let data;
    try {
      data = await readCounts(rows.map((li) => li.getAttribute("data-id")));
    } catch (e) {
      return;
    }
    for (const li of rows) {
      const counts = data[li.getAttribute("data-id")];
      const out = li.querySelector(".trending-count");
      if (counts && out) out.textContent = String(totalOf(counts));
    }
  }

  async function buildStatic() {
    const stories = JSON.parse(document.getElementById("trending-stories")?.textContent || "[]");
    if (!stories.length) return;
    let data;
    try {
      data = await readCounts(stories.map((story) => story.id));
    } catch (e) {
      return;
    }
    const esc = (s) =>
      String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const top = stories
      .map((story) => ({ id: story.id, title: story.title, href: story.href, total: totalOf(data[story.id]) }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    if (top.length < 3) return; // stay hidden until there's real signal
    ol.innerHTML = top
      .map(
        (r, i) =>
          `<li data-id="${esc(r.id)}"><a href="${esc(r.href)}"><span class="trending-rank">${i + 1}</span><span class="trending-title">${esc(r.title)}</span><span class="trending-count">${r.total}</span></a></li>`
      )
      .join("");
    sec.hidden = false;
  }
}

if (typeof window !== "undefined") initTrending(window);
