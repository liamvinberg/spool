/**
 * A page's identity, which is its path under design/frames/ (#231).
 *
 * `explorations/chat` is one page, `explorations` is the page holding it, and
 * the frames directory itself is the root page, spelled `""` — permanent, the
 * one page with no folder to name it, and the one page the rail draws no row
 * for. A flat project's page paths are its page names, so nothing here reads
 * differently for one.
 *
 * Pure, and deliberately free of node: the daemon owns the disk and the canvas
 * owns the rail, and both of them have to spell a page the same way.
 */

/** The root page's slot — the frames directory itself, and the wire's spelling of it. */
export const ROOT_PAGE = "";

/** One rule for every name that becomes a path segment: frames, pages, scenarios. */
export function isSafeName(segment: string): boolean {
	return segment.length > 0 && !segment.startsWith(".") && !segment.includes("/") && !segment.includes("\\");
}

/** The segments of a page path; the root page has none. */
export function pageSegments(page: string): string[] {
	return page === ROOT_PAGE ? [] : page.split("/");
}

/** A named page, every segment of it safe. The root page is not one: it has no folder. */
export function isPagePath(page: string): boolean {
	return page !== ROOT_PAGE && page.split("/").every(isSafeName);
}

/** Anywhere a page can be: a named page, or the root page itself. */
export function isPageSlot(page: string): boolean {
	return page === ROOT_PAGE || isPagePath(page);
}

/** The page holding this one — the root page for a page at the top level. */
export function pageParent(page: string): string {
	const at = page.lastIndexOf("/");
	return at === -1 ? ROOT_PAGE : page.slice(0, at);
}

/** What the page is called, which is the last segment of its path. */
export function pageName(page: string): string {
	const at = page.lastIndexOf("/");
	return at === -1 ? page : page.slice(at + 1);
}

/** Where a name sits under a parent page; joining nothing onto a page is that page. */
export function pageUnder(parent: string, name: string): string {
	if (parent === ROOT_PAGE) return name;
	if (name === ROOT_PAGE) return parent;
	return `${parent}/${name}`;
}

/** Whether a page sits inside another — strictly, so no page is within itself. */
export function pageWithin(ancestor: string, page: string): boolean {
	if (page === ancestor) return false;
	return ancestor === ROOT_PAGE || page.startsWith(`${ancestor}/`);
}

/**
 * The page a frame sits on, spelled the way a page path is.
 *
 * A projected frame leaves the field out on the root page, because the root
 * page has no folder to name; every reader that groups frames by page has to
 * put it back, and this is the one place that says how.
 */
export function pageSlot(frame: { page?: string }): string {
	return frame.page ?? ROOT_PAGE;
}

/**
 * Whether a page's subtree holds a slot: the page itself, or anything under it
 * at any depth. What "the frames under this page" means, said once — the daemon
 * places a page object by it and the canvas draws one by it.
 */
export function pageHolds(page: string, slot: string): boolean {
	return slot === page || pageWithin(page, slot);
}

/**
 * How deep a page's row is drawn, which is one less than its segments because
 * the root page has no row: `shop` stands at the margin and `shop/sale` one
 * step in under it. The one thing about the root page the rail knows.
 */
export function pageDepth(page: string): number {
	return page === ROOT_PAGE ? 0 : page.split("/").length - 1;
}

/** Every page from the top down to this one, itself last; the root page has none. */
export function pageChain(page: string): string[] {
	return pageSegments(page).map((_, at, all) => all.slice(0, at + 1).join("/"));
}

/**
 * Where a page path lands when `from` becomes `to`, or nothing when the move
 * never touched it. A page carries its whole subtree, so every key naming a
 * page inside the one that moved is rewritten with it.
 */
export function carriedPage(page: string, from: string, to: string): string | undefined {
	if (page === from) return to;
	if (!page.startsWith(`${from}/`)) return undefined;
	return `${to}${page.slice(from.length)}`;
}

/**
 * Anything keyed by page path, said again at the paths a move leaves behind.
 *
 * Three durables are keyed this way — the stored order's two lists and the
 * per-page cameras — and re-keying one is the same walk every time, so it is
 * path vocabulary rather than any of their business.
 */
export function carriedKeys<T>(held: Record<string, T>, from: string, to: string): Record<string, T> {
	return Object.fromEntries(Object.entries(held).map(([page, value]) => [carriedPage(page, from, to) ?? page, value]));
}
