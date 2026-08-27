/**
 * What a page looks like standing on the field that holds it (#265).
 *
 * A page holds frames, so it is drawn as its own canvas: every frame under it,
 * at its own geometry, inside one box. Nothing is baked and nothing is stored —
 * the projection already carries every frame's page, geometry and cover, so the
 * picture is composed from what a reader already has and a frame edited two
 * levels down redraws the object above it for free.
 *
 * Two rules make real pages legible without lying about what they are. Real
 * pages are not card-shaped: this repository's `booting` is twenty frames in
 * one row at 23:1 and `variants` is a block at 0.87:1. So the box's **shape**
 * is the subtree's own aspect clamped to a band, and its **size** is grown from
 * what the page holds rather than from that aspect — under true aspect a page
 * of one frame drew larger than a page of twenty-seven.
 *
 * Pure, and deliberately free of node: the daemon places a page it has never
 * seen before and the canvas draws it, and both of them have to work out the
 * same box.
 */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Size {
	w: number;
	h: number;
}

/** The shape band a page's box is clamped into, whatever its frames are arranged like. */
export const PAGE_ASPECT_LOW = 0.62;
export const PAGE_ASPECT_HIGH = 2.4;

/** Past this the subtree is folded into bands rather than drawn as one long line. */
export const FOLD_ASPECT = 2.6;
/** What a fold aims at: the band count that lands the sheet near this aspect. */
const FOLD_TARGET = 1.5;
/** The space between two stacked bands, in the frames' own world units. */
export const FOLD_GUTTER = 400;

/**
 * The frame nobody sized, which is also the page nobody put a frame on. It is
 * `projection.ts`'s own floor, said again here because a page whose holder has
 * no frames of its own still has to be given a size.
 */
const DEFAULT_W = 1440;
const DEFAULT_H = 900;
export const DEFAULT_FRAME_AREA = DEFAULT_W * DEFAULT_H;

/**
 * The frames of a page's subtree, arranged inside the object's own space.
 *
 * `bands` is how many rows the fold took, and 1 means the frames are where they
 * actually are. A folded composition stops being a picture of *where* the
 * frames sit and becomes one of *what* they are; that cost is only paid by a
 * page long enough to be a hairline otherwise.
 */
export interface PageComposition<T extends Rect = Rect> {
	/** The frames as the picture places them, each carrying whatever it arrived with. */
	readonly frames: readonly T[];
	readonly w: number;
	readonly h: number;
	readonly bands: number;
}

function boundsOf(frames: readonly Rect[]): Rect {
	const minX = Math.min(...frames.map((frame) => frame.x));
	const minY = Math.min(...frames.map((frame) => frame.y));
	const maxX = Math.max(...frames.map((frame) => frame.x + frame.w));
	const maxY = Math.max(...frames.map((frame) => frame.y + frame.h));
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * How many bands a subtree of this aspect folds into. Two at the least, because
 * a fold that produced one band would be a fold that did nothing.
 */
export function bandsFor(aspect: number): number {
	return Math.max(2, Math.ceil(Math.sqrt(aspect / FOLD_TARGET)));
}

/** The x-ordered frames cut into runs of equal count; the last run takes the remainder. */
function cutIntoBands<T extends Rect>(frames: readonly T[], bands: number): T[][] {
	const ordered = [...frames].sort((a, b) => a.x - b.x || a.y - b.y);
	const per = Math.ceil(ordered.length / bands);
	const cut: T[][] = [];
	for (let at = 0; at < ordered.length; at += per) cut.push(ordered.slice(at, at + per));
	return cut;
}

/**
 * Every frame under a page, composed into one picture.
 *
 * Unfolded is the common case and is the frames exactly as they stand, moved to
 * their own origin. A long page is cut into bands in x order and stacked, which
 * keeps every frame and keeps the reading order — the move a contact sheet
 * makes.
 */
export function composePage<T extends Rect>(frames: readonly T[]): PageComposition<T> {
	if (frames.length === 0) return { frames: [], w: 0, h: 0, bands: 1 };
	const box = boundsOf(frames);
	const aspect = box.h === 0 ? FOLD_ASPECT : box.w / box.h;
	if (aspect <= FOLD_ASPECT) {
		return {
			frames: frames.map((frame) => ({ ...frame, x: frame.x - box.x, y: frame.y - box.y })),
			w: box.w,
			h: box.h,
			bands: 1,
		};
	}
	const cut = cutIntoBands(frames, bandsFor(aspect));
	const placed: T[] = [];
	let top = 0;
	let width = 0;
	for (const band of cut) {
		const bounds = boundsOf(band);
		for (const frame of band) {
			placed.push({ ...frame, x: frame.x - bounds.x, y: frame.y - bounds.y + top });
		}
		top += bounds.h + FOLD_GUTTER;
		width = Math.max(width, bounds.w);
	}
	return { frames: placed, w: width, h: top - FOLD_GUTTER, bands: cut.length };
}

/**
 * The median area of the frames a page's object stands among.
 *
 * Size is read against the neighbours rather than against a constant, so a page
 * of phones and a page of desktops each draw at the scale of the field they sit
 * on. A field with no frames of its own has nothing to be read against and
 * falls back to what an unsized frame is.
 */
export function medianFrameArea(frames: readonly Size[]): number {
	if (frames.length === 0) return DEFAULT_FRAME_AREA;
	const areas = frames.map((frame) => frame.w * frame.h).sort((a, b) => a - b);
	const middle = Math.floor(areas.length / 2);
	const high = areas[middle] ?? DEFAULT_FRAME_AREA;
	if (areas.length % 2 === 1) return high;
	const low = areas[middle - 1] ?? high;
	return (low + high) / 2;
}

/** What an unsized frame's shape is, and so what a page with no shape to read draws at. */
const DEFAULT_ASPECT = DEFAULT_W / DEFAULT_H;

/**
 * A subtree's aspect held inside the band. A subtree with no height to measure
 * has no shape to state, so it takes the shape of a frame nobody sized rather
 * than falling silently to one end of the band.
 */
export function clampPageAspect(aspect: number): number {
	if (!Number.isFinite(aspect) || aspect <= 0) return DEFAULT_ASPECT;
	return Math.min(PAGE_ASPECT_HIGH, Math.max(PAGE_ASPECT_LOW, aspect));
}

/**
 * The box a page's object occupies on the field holding it.
 *
 * Area is the median frame area of that field times the square root of how many
 * frames are under the page, so a page holding one frame draws exactly one
 * frame big and a page holding forty-five draws about two and a half times
 * wider. The square root is what keeps a large page from swamping the field it
 * is one object on.
 *
 * The aspect is the composition's, which means the folded one where a page
 * folded. The box is a box around a picture, and the picture is the sheet: a
 * `booting` folded to 1.3:1 drawn into a 2.4:1 box would be a wide tile mostly
 * made of gap. `explorer-real--tile`, the frame this is built against, reads
 * the folded sheet's own shape for the same reason.
 */
export function pageBox(composition: PageComposition<Rect>, medianArea: number, count: number): Size {
	const area = medianArea * Math.sqrt(Math.max(1, count));
	const aspect = clampPageAspect(composition.h === 0 ? 0 : composition.w / composition.h);
	const w = Math.round(Math.sqrt(area * aspect));
	return { w, h: Math.round(w / aspect) };
}

/**
 * The composition scaled into its box, whole rather than cropped.
 *
 * The box's aspect is banded and the composition's is not, so a page longer or
 * squarer than the band sits inside its box with room at two edges. That gap is
 * the fact the band is hiding, stated rather than cut away.
 */
export function fitComposition(
	composition: PageComposition<Rect>,
	box: Size,
): { scale: number; dx: number; dy: number } {
	if (composition.w === 0 || composition.h === 0) return { scale: 1, dx: 0, dy: 0 };
	const scale = Math.min(box.w / composition.w, box.h / composition.h);
	return {
		scale,
		dx: (box.w - composition.w * scale) / 2,
		dy: (box.h - composition.h * scale) / 2,
	};
}
