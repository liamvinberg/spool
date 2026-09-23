/** One box in the pixels its owner measures in: a rect, as the ring draws it. */
export interface RingBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Two boxes that are one line of words: their centres are inside each other. */
function sameLine(a: RingBox, b: RingBox): boolean {
	return Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < Math.min(a.h, b.h) / 2;
}

/**
 * The boxes one element's ring is drawn from (#321).
 *
 * An inline element that wraps is not a rectangle. `getBoundingClientRect`
 * answers with the box around all of its lines at once, which on a wrapped
 * span reaches across words belonging to its neighbours and hugs nothing you
 * could point at. Its line boxes are what it actually is, so the ring is drawn
 * round each of them — and two boxes on one line are drawn as the one line
 * they are, rather than as a seam through the middle of a word.
 */
export function lineBoxes(hit: { rect: RingBox; rects?: readonly RingBox[] | undefined }): RingBox[] {
	const lines = hit.rects ?? [];
	if (lines.length < 2) return [hit.rect];
	const drawn: RingBox[] = [];
	for (const box of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
		const last = drawn[drawn.length - 1];
		if (last === undefined || !sameLine(last, box)) {
			drawn.push(box);
			continue;
		}
		const x = Math.min(last.x, box.x);
		const y = Math.min(last.y, box.y);
		drawn[drawn.length - 1] = {
			x,
			y,
			w: Math.max(last.x + last.w, box.x + box.w) - x,
			h: Math.max(last.y + last.h, box.y + box.h) - y,
		};
	}
	return drawn;
}
