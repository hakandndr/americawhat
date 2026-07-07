const API = "/analytics";

// ── Analytics beacon ──
(function () {
  try {
    const p = location.pathname || "/";
    const r = encodeURIComponent(document.referrer || "");
    fetch(`${API}/log_df.php?path=${encodeURIComponent(p)}&referrer=${r}`, {
      method: "GET",
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
})();

// ── Reactions (works on feed and detail pages) ──
const voteKey = (id, reaction) => `aw_voted_${id}_${reaction}`;
const groups = Array.from(document.querySelectorAll(".reactions[data-id]"));

async function loadVotes() {
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
        if (localStorage.getItem(voteKey(id, rk))) btn.classList.add("voted");
      } catch (e) {}
    });
  });
}

document.querySelectorAll(".react-btn").forEach((btn) => {
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const group = btn.closest(".reactions");
    const id = group?.dataset.id;
    const rk = btn.getAttribute("data-reaction");
    if (!id || !rk) return;

    let already = false;
    try {
      already = !!localStorage.getItem(voteKey(id, rk));
    } catch (e) {}
    if (already) return;

    const countEl = btn.querySelector(".react-count");
    countEl.textContent = (parseInt(countEl.textContent || "0", 10) + 1).toString();
    btn.classList.add("voted");
    try {
      localStorage.setItem(voteKey(id, rk), "1");
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

loadVotes();
