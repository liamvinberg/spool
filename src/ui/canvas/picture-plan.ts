import type { PixelSize } from "./cover-size";

/**
 * What the picture layer decides before it touches the GPU: how big a texture
 * a frame's picture needs at the size it is drawn, where the picture sits in
 * its frame, how textures share the units one draw can bind, and which
 * sharper pictures go when memory runs out. Pure, so each rule is tested on
 * its own, and the layer is left with only the GL calls.
 */

/**
 * The side of the square every frame's picture is kept at, always (#81).
 *
 * Sized to what an overview shows rather than to what a close-up wants: a page
 * of a thousand frames fits on screen with each one a few dozen CSS pixels
 * wide, and 128 texels covers that at 2x with room to spare, for a quarter of
 * the memory a 256 square would cost (about 90 MB against 350 MB on a
 * thousand frames). Anything drawn larger streams a sharper copy while it is
 * on screen.
 */
export const RESIDENT_PX = 128;

/**
 * The sharper copies streamed for frames drawn wider than the resident
 * square, by texel width, before the cover itself. Each step doubles, so a
 * picture never holds much more than four times the texels its frame shows;
 * past the last step it is the full cover, which is what 100% zoom draws.
 */
export const SHARP_WIDTHS = [256, 512] as const;

/** The size the picture of a `natural`-sized cover draws in a `w` x `h` frame: contained, never stretched. */
export function containSize(w: number, h: number, natural: PixelSize): { w: number; h: number } {
	const scale = Math.min(w / natural.width, h / natural.height);
	return { w: natural.width * scale, h: natural.height * scale };
}

/**
 * The texture a picture needs to draw `drawn` device pixels as sharp as the
 * cover itself would: the resident square when both sides fit in it, else the
 * narrowest sharper copy at least as wide as the drawing, else the cover at
 * its own size. A sharper copy keeps the cover's shape, so its width decides.
 *
 * `maxSide` is the GPU's texture limit: a cover taller than it (a capture
 * allows 32 megapixels) is scaled down to fit, the one case where the full
 * tier holds less than the file.
 */
export function textureFor(
	drawn: { w: number; h: number },
	natural: PixelSize,
	maxSide: number,
): { kind: "resident" } | { kind: "sharp"; width: number; height: number } {
	if (drawn.w <= RESIDENT_PX && drawn.h <= RESIDENT_PX) return { kind: "resident" };
	const step = SHARP_WIDTHS.find((width) => width >= drawn.w && width < natural.width);
	const width = step ?? natural.width;
	const fit = Math.min(1, maxSide / width, maxSide / ((natural.height * width) / natural.width));
	return {
		kind: "sharp",
		width: Math.max(1, Math.round(width * fit)),
		height: Math.max(1, Math.round(((natural.height * width) / natural.width) * fit)),
	};
}

/** GPU bytes for an RGBA8 texture of this size, with or without its mip chain (a third more). */
export function textureBytes(width: number, height: number, mipmapped: boolean): number {
	const base = width * height * 4;
	return mipmapped ? Math.ceil((base * 4) / 3) : base;
}

/**
 * How many sampler units one draw gives sharper textures. A fragment shader
 * gets at least 16 in WebGL2, and the first is the resident array's.
 */
export const SHARP_UNITS = 15;

/**
 * Split a run of pictures, in drawing order, into draws that each bind at most
 * `units` distinct sharper textures, and say which unit each picture samples
 * (0 for the resident array, 1.. for a sharper texture).
 *
 * The run stays in order across the cut, so a frame drawn after another still
 * lands on top of it where they overlap — the order the frames had as DOM
 * siblings. A page with no frame drawn large is one draw.
 */
export function bindUnits<T>(
	textures: readonly (T | null)[],
	units = SHARP_UNITS,
): { unit: number[]; draws: { start: number; end: number; bound: T[] }[] } {
	const unit: number[] = [];
	const draws: { start: number; end: number; bound: T[] }[] = [];
	let bound = new Map<T, number>();
	let start = 0;
	textures.forEach((texture, index) => {
		if (texture === null) {
			unit.push(0);
			return;
		}
		let at = bound.get(texture);
		if (at === undefined) {
			if (bound.size === units) {
				draws.push({ start, end: index, bound: [...bound.keys()] });
				bound = new Map();
				start = index;
			}
			at = bound.size + 1;
			bound.set(texture, at);
		}
		unit.push(at);
	});
	if (textures.length > start || draws.length === 0)
		draws.push({ start, end: textures.length, bound: [...bound.keys()] });
	return { unit, draws };
}

/**
 * The sharper textures to let go of so the rest fit in `budget` bytes: least
 * recently drawn first, and never one drawn in the current frame (`now`),
 * since dropping a texture on screen only to stream it again is the thrash
 * this budget exists to prevent.
 */
export function evictions<K>(
	entries: Iterable<{ key: K; bytes: number; used: number }>,
	budget: number,
	now: number,
): K[] {
	const all = [...entries];
	let total = all.reduce((sum, entry) => sum + entry.bytes, 0);
	if (total <= budget) return [];
	const out: K[] = [];
	for (const entry of all.filter((each) => each.used < now).sort((a, b) => a.used - b.used)) {
		if (total <= budget) break;
		out.push(entry.key);
		total -= entry.bytes;
	}
	return out;
}
