export function initTracking(window) {
  const { document, location, crypto } = window;
  const fetch = window.fetch.bind(window);
  const API = "/analytics";

  // ── Analytics beacon ──
  // One POST per page view. `evt` is a per-view id so a retried delivery can
  // never be counted twice. The same URL works on both hosts during migration.
  (function () {
    try {
      const body = new URLSearchParams({
        path: location.pathname || "/",
        referrer: document.referrer || "",
        evt: crypto && crypto.randomUUID ? crypto.randomUUID() : "",
      });
      fetch(`${API}/log_df.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  })();

  // ── Reactions (feed, category and detail pages) ──
  // Groups present at load are wired here; stories appended later by the feed's
  // "Load more" announce themselves with an "aw:feed-append" event.
  const voteKey = (id, reaction) => `aw_voted_${id}_${reaction}`;

  function markVoted(btn) {
    btn.classList.add("voted");
    btn.setAttribute("aria-pressed", "true");
  }

  async function loadVotes(groups) {
    const ids = groups.map((g) => g.dataset.id).filter(Boolean);
    if (!ids.length) return;
    try {
      const res = await fetch(`${API}/get_votes.php?ids=${ids.join(",")}`);
      const data = await res.json();
      groups.forEach((group) => {
        const id = group.dataset.id;
        const counts = (data && data[id]) || {};
        group.querySelectorAll(".react-count").forEach((el) => {
          const k = el.getAttribute("data-count");
          el.textContent = counts[k] ?? 0;
        });
      });
    } catch (e) {}
    // restore local voted state
    groups.forEach((group) => {
      const id = group.dataset.id;
      group.querySelectorAll(".react-btn").forEach((btn) => {
        const rk = btn.getAttribute("data-reaction");
        try {
          if (window.localStorage.getItem(voteKey(id, rk))) markVoted(btn);
        } catch (e) {}
      });
    });
  }

  const initializedGroups = new WeakSet();
  function bindButtons(root) {
    root.querySelectorAll(".react-btn").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const group = btn.closest(".reactions");
        const id = group?.dataset.id;
        const rk = btn.getAttribute("data-reaction");
        if (!id || !rk) return;

        let already = false;
        try {
          already = !!window.localStorage.getItem(voteKey(id, rk));
        } catch (e) {}
        if (already) return;

        const countEl = btn.querySelector(".react-count");
        countEl.textContent = (parseInt(countEl.textContent || "0", 10) + 1).toString();
        markVoted(btn);
        try {
          window.localStorage.setItem(voteKey(id, rk), "1");
        } catch (e) {}

        try {
          await fetch(`${API}/vote.php`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `id=${encodeURIComponent(id)}&reaction=${encodeURIComponent(rk)}`,
          });
        } catch (e) {}
      });
    });
  }

  bindButtons(document);
  const initialGroups = Array.from(document.querySelectorAll(".reactions[data-id]"));
  initialGroups.forEach((g) => initializedGroups.add(g));
  loadVotes(initialGroups);

  document.addEventListener("aw:feed-append", (ev) => {
    const nodes = (ev.detail && ev.detail.nodes) || [];
    const groups = [];
    nodes.forEach((node) => {
      bindButtons(node);
      node.querySelectorAll(".reactions[data-id]").forEach((g) => {
        if (initializedGroups.has(g)) return;
        initializedGroups.add(g);
        groups.push(g);
      });
    });
    loadVotes(groups);
  });

}

if (typeof window !== "undefined") initTracking(window);
