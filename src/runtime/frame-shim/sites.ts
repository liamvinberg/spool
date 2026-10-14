/**
 * Where each anchor's element sits, over the one set of data-spool-source
 * stamps. Two forms of anchor, one message and one answer shape:
 *
 *   a point (#34) — one stamp exactly, keyed path:line:col. Navigation
 *   sites, with the rendered data-go attribute as fallback, because a
 *   component-wrapped element stamps where it is authored rather than at
 *   the site.
 *
 *   a range (#214) — every stamp on this file whose line falls inside it,
 *   unioned, keyed path:from-to. Where one write landed: the daemon reads
 *   the file and answers lines, and only the document can turn lines into
 *   a box. The union rather than the outermost, because the lines an edit
 *   touched need not render one element and a plate has to cover them all.
 */

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Site {
	path: string;
	line: number;
	col?: number;
	through?: number;
	target?: unknown;
}

export function siteBoxes(sites: unknown): Record<string, Box | null> {
	const byStamp = new Map<string, Element>();
	const stamped = Array.from(document.querySelectorAll("[data-spool-source]"));
	for (const el of stamped) {
		const stamp = el.getAttribute("data-spool-source");
		if (stamp && !byStamp.has(stamp)) byStamp.set(stamp, el);
	}
	const carriers = Array.from(document.querySelectorAll("[data-go]"));
	const claimed = new Set<Element>();
	const boxes: Record<string, Box | null> = {};
	for (const site of (Array.isArray(sites) ? sites : []) as Array<Site | null>) {
		if (!site || typeof site.path !== "string") continue;
		if (typeof site.through === "number") {
			boxes[`${site.path}:${site.line}-${site.through}`] = rangeBox(stamped, site as Site & { through: number });
			continue;
		}
		const key = `${site.path}:${site.line}:${site.col}`;
		let el = byStamp.get(key) || null;
		if (!el && typeof site.target === "string") {
			el = carriers.find((c) => c.getAttribute("data-go") === site.target && !claimed.has(c)) || null;
		}
		if (el) claimed.add(el);
		if (el) {
			const rect = el.getBoundingClientRect();
			boxes[key] = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
		} else {
			boxes[key] = null;
		}
	}
	return boxes;
}

// the union of every stamped element this file authored inside these lines,
// clipped to the frame. An element with no area is skipped: a stamp
// resolving to something laid out nowhere would drag the union to the
// document's own origin.
//
// The clip is what keeps a mark about the frame (#222). A union is bounded
// by the elements it covers and by nothing else, so a whole-file write takes
// every stamp in the document and an edit below the fold measures past the
// bottom edge — either one draws a lane taller than the frame it is beside.
// These rects are viewport-relative and a frame document's viewport is the
// frame, so the frame's own rectangle is the clip. A range that renders
// nothing inside it answers no box, the same as one that renders nothing at
// all, and a rewrite of the whole file legitimately answers the whole frame.
function rangeBox(stamped: readonly Element[], site: Site & { through: number }): Box | null {
	let x0 = 0;
	let y0 = 0;
	let x1 = 0;
	let y1 = 0;
	let found = false;
	for (const el of stamped) {
		const stamp = el.getAttribute("data-spool-source") || "";
		const cut = stamp.lastIndexOf(":");
		const split = cut < 0 ? -1 : stamp.lastIndexOf(":", cut - 1);
		if (split < 0 || stamp.slice(0, split) !== site.path) continue;
		const line = parseInt(stamp.slice(split + 1, cut), 10);
		if (!(line >= site.line) || !(line <= site.through)) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		if (!found) {
			x0 = rect.x;
			y0 = rect.y;
			x1 = rect.x + rect.width;
			y1 = rect.y + rect.height;
			found = true;
			continue;
		}
		x0 = Math.min(x0, rect.x);
		y0 = Math.min(y0, rect.y);
		x1 = Math.max(x1, rect.x + rect.width);
		y1 = Math.max(y1, rect.y + rect.height);
	}
	if (!found) return null;
	const left = Math.min(Math.max(x0, 0), innerWidth);
	const top = Math.min(Math.max(y0, 0), innerHeight);
	const right = Math.min(Math.max(x1, 0), innerWidth);
	const bottom = Math.min(Math.max(y1, 0), innerHeight);
	if (!(right > left) || !(bottom > top)) return null;
	return { x: left, y: top, w: right - left, h: bottom - top };
}
