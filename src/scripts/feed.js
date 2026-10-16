// Adapted from the experimental V3 static chunk loader; uses baseline cards.
export function initFeed(window) {
  const { document, history, performance, DOMParser } = window;
  const feed = document.querySelector("[data-feed]");
  if (!feed) return;
  const list = feed.querySelector(".feed");
  const status = feed.querySelector(".feed-status");
  let more = feed.querySelector(".load-more");
  const seen = new Set(Array.from(list.querySelectorAll(".card[data-id]"), (p) => p.dataset.id));
  let busy = false;
  const setIdle = (label) => {
    if (!more) return;
    more.textContent = label;
    more.removeAttribute("aria-busy");
    more.removeAttribute("aria-disabled");
  };

  async function loadNext(focusNew) {
    if (busy || !more) return false;
    busy = true;
    const url = more.getAttribute("href");
    const next = Number(more.dataset.next);
    more.setAttribute("aria-busy", "true");
    more.setAttribute("aria-disabled", "true");
    more.textContent = "Loading…";
    status.textContent = "Loading more stories…";
    try {
      const res = await window.fetch(url, { headers: { Accept: "text/html" } });
      if (!res.ok) throw new Error(String(res.status));
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const chunk = doc.querySelector("[data-feed]");
      const incoming = Array.from(doc.querySelectorAll("[data-feed] .feed > .card[data-id]"));
      if (Number(chunk?.dataset.page) !== next || !incoming.length) throw new Error("Invalid feed chunk");
      const nextLink = chunk.querySelector(".load-more");
      if (nextLink && (Number(nextLink.dataset.next) !== next + 1 || nextLink.getAttribute("href") !== `/feed/${next + 1}/`)) {
        throw new Error("Invalid next page");
      }
      const added = [];
      for (const card of incoming) {
        if (seen.has(card.dataset.id)) continue;
        seen.add(card.dataset.id);
        const node = document.importNode(card, true);
        list.appendChild(node);
        added.push(node);
      }
      // Only cards are imported. Scripts/analytics in the fetched page never run.
      document.dispatchEvent(new window.CustomEvent("aw:feed-append", { detail: { nodes: added } }));
      if (nextLink) {
        more.setAttribute("href", nextLink.getAttribute("href"));
        more.dataset.next = nextLink.dataset.next;
        setIdle("Load more stories ↓");
      } else {
        const end = document.createElement("p");
        end.className = "feed-end";
        end.append("That’s every story in the feed. ");
        const a = document.createElement("a");
        a.href = "/archive/";
        a.textContent = "Browse the archive";
        end.append(a);
        more.replaceWith(end);
        more = null;
      }
      status.textContent = `${added.length} more ${added.length === 1 ? "story" : "stories"} loaded.`;
      history.replaceState({ ...(history.state || {}), awFeedPage: next }, "");
      if (focusNew) added[0]?.querySelector(".title-link")?.focus();
      return true;
    } catch {
      status.textContent = "Could not load more stories. Try again, or open the next page in a new tab.";
      setIdle("Try again ↓");
      return false;
    } finally {
      busy = false;
    }
  }

  feed.addEventListener("click", (e) => {
    const link = e.target.closest(".load-more");
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void loadNext(true);
  });

  const navType = performance.getEntriesByType("navigation")[0]?.type;
  const restoring = navType === "back_forward" || navType === "reload";
  const wanted = restoring ? Math.min(Number(history.state?.awFeedPage || 0), Number(feed.dataset.last)) : 0;
  if (!restoring && history.state?.awFeedPage) {
    const { awFeedPage, awScroll, ...rest } = history.state;
    history.replaceState(rest, "");
  }
  if (wanted > Number(feed.dataset.page)) {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    // loadNext updates history: capture the saved position before restoration.
    const y = Number(history.state?.awScroll);
    void (async () => {
      try {
        while (more && Number(more.dataset.next) <= wanted) {
          if (!(await loadNext(false))) break;
        }
        if (Number.isFinite(y) && y > 0) window.scrollTo({ top: y, behavior: "instant" });
      } finally {
        history.scrollRestoration = previousRestoration;
      }
    })();
  }
  window.addEventListener("pagehide", () => {
    history.replaceState({ ...(history.state || {}), awScroll: window.scrollY }, "");
  });
}

if (typeof window !== "undefined") initFeed(window);
