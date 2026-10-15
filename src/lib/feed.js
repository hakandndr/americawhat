// Static listings only: content and the shared slug assignment stay untouched.
import { items } from "./items.js";

export const FEED_PAGE_SIZE = 12;
export const ARCHIVE_PAGE_SIZE = 30;
// Preserve the baseline feed's order, including its existing same-date order.
export const newest = [...items].sort((a, b) => (a.date < b.date ? 1 : -1));
export const feedHref = (page = 1) => page > 1 ? `/feed/${page}/` : "/";
export const archiveHref = (page = 1) => page > 1 ? `/archive/${page}/` : "/archive/";
export const categoryHref = (key, page = 1) => `/category/${key}/${page > 1 ? `${page}/` : ""}`;
