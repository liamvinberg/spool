/**
 * What the picture layer decides before it touches the GPU: which texture of a
 * frame's still it draws from at the size the frame is drawn, where the
 * picture sits in its frame, how textures share the units one draw can bind,
 * which halvings go when memory runs out, and how much a frame may upload.
 * Pure, so each rule is tested on its own, and the layer is left with the
 * state and the GL calls.
 *
 * A still is one image at one address (`CONTEXT.md`). The GPU keeps it two
 * ways, both made from that one image: its square, which every frame on the
 * page has, and its halvings, the still halved as many times as the frame's
 * drawn size allows, which a frame drawn larger than the square streams while
 * it is on screen.
 */

/** An image's size in its own pixels. */
export interface PixelSize {
	width: number;
	height: number;
}

/**
 * The side of the square every frame's still is kept at, always (#81).
 *
 * Sized to what an overview shows rather than to what a close-up wants: a page
 * of a thousand frames fits on screen with each one about thirty CSS pixels
 * wide, which 64 texels covers at 2x. Every frame on the page pays for its
 * square whether it is on screen or not, so the squares are the whole of the
 * layer's cost in page size: 22 MB on a thousand frames, mips included, where
 * a 128 square measured 120 MB more GPU process memory than the image elements
 * it replaced and a 256 one would be 350 MB. Anything drawn larger streams a
 * halving while it is on screen.
 */
export const SQUARE_PX = 64;

/**
 * What a frame is drawn from: its still's square, or a halving of its still,
 * the still itself when halved no times. The same shape says what was drawn
 * and what the frame's size wants.
 */
export interface Texture {
	kind: "square" | "halving";
	width: number;
	height: number;
}

export const SQUARE: Texture = { kind: "square", width: SQUARE_PX, height: SQUARE_PX };

/**
 * The order loads are taken in: what a frame drawn on screen wants, then what
 * a frame its DOM shell is drawing would want on its way back to a picture,
 * then the rest of the page.
 */
export const Priority = { drawn: 0, shell: 1, page: 2 } as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

/** The size a `natural`-sized still draws in a `w` x `h` frame: contained, never stretched. */
export function containSize(w: number, h: number, natural: PixelSize): { w: number; h: number } {
	const scale = Math.min(w / natural.width, h / natural.height);
	return { w: natural.width * scale, h: natural.height * scale };
}

/**
 * The texture a still needs to draw `drawn` device pixels the way the image
 * element drew it: the square when both sides fit in it, else the halving of
 * the still that is the smallest at least as wide as the drawing, else the
 * still itself.
 *
 * Halvings because that is what Chrome draws a shrunk image from: the level of
 * its mip chain at least as large as the drawing, filtered linearly. A texture
 * at exactly that size, sampled the same way (`picture-gl.ts`), is the same
 * picture, where one at some other size draws softer or harsher. A halving
 * keeps the still's shape, so its width decides.
 *
 * `maxSide` is the GPU's texture limit: a still taller than it (a capture
 * allows 32 megapixels) is scaled down to fit, the one case where the GPU
 * holds less than the file.
 */
export function textureFor(drawn: { w: number; h: number }, natural: PixelSize, maxSide: number): Texture {
	if (drawn.w <= SQUARE_PX && drawn.h <= SQUARE_PX) return SQUARE;
	let width = natural.width;
	while (width / 2 >= drawn.w && width / 2 > SQUARE_PX) width /= 2;
	const height = (natural.height * width) / natural.width;
	const fit = Math.min(1, maxSide / width, maxSide / height);
	return {
		kind: "halving",
		width: Math.max(1, Math.round(width * fit)),
		height: Math.max(1, Math.round(height * fit)),
	};
}

/**
 * The sizes a bitmap passes through on its way from `from` down to `to`,
 * ending at `to`: each step halves every side whose half still reaches its
 * target, so no step shrinks a side much more than twofold, and a linear
 * filter at each one averages every pixel it covers rather than skipping some
 * (`picture-loader.ts`). Empty when `from` is `to`; a side already smaller
 * than its target is left for the last step to grow.
 */
export function halvingSteps(from: PixelSize, to: PixelSize): PixelSize[] {
	const steps: PixelSize[] = [];
	const half = (side: number, goal: number) => (Math.round(side / 2) >= goal ? Math.round(side / 2) : side);
	let { width, height } = from;
	for (;;) {
		const next = { width: half(width, to.width), height: half(height, to.height) };
		if (next.width === width && next.height === height) break;
		steps.push(next);
		({ width, height } = next);
	}
	if (width !== to.width || height !== to.height) steps.push(to);
	return steps;
}

/** How the layer and its loaders name one halving of a still; a still's square goes by the still's own address. */
export const halvingKey = (still: string, width: number): string => `${still}#${width}`;

/** GPU bytes for an RGBA8 texture of this size, with or without its mip chain (a third more). */
export function textureBytes(width: number, height: number, mipmapped: boolean): number {
	const base = width * height * 4;
	return mipmapped ? Math.ceil((base * 4) / 3) : base;
}

/**
 * How many sampler units one draw gives halvings. A fragment shader gets at
 * least 16 in WebGL2, and the first is the square array's.
 */
export const HALVING_UNITS = 15;

/**
 * Split a run of pictures, in drawing order, into draws that each bind at most
 * `units` distinct halvings, and say which unit each picture samples (0 for
 * the square array, 1.. for a halving).
 *
 * The run stays in order across the cut, so a frame drawn after another still
 * lands on top of it where they overlap — the order the frames had as DOM
 * siblings. A page with no frame drawn large is one draw.
 */
export function bindUnits<T>(
	textures: readonly (T | null)[],
	units = HALVING_UNITS,
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
		let held = bound.get(texture);
		if (held === undefined) {
			if (bound.size === units) {
				draws.push({ start, end: index, bound: [...bound.keys()] });
				bound = new Map();
				start = index;
			}
			held = bound.size + 1;
			bound.set(texture, held);
		}
		unit.push(held);
	});
	if (textures.length > start || draws.length === 0)
		draws.push({ start, end: textures.length, bound: [...bound.keys()] });
	return { unit, draws };
}

/**
 * The halvings to let go of so the rest fit in `budget` bytes: least recently
 * drawn first, and never one drawn in the current frame (`now`), since
 * dropping a texture on screen only to stream it again is the thrash this
 * budget exists to prevent.
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

/**
 * What one drawn frame may spend uploading. A texture upload is a copy the GPU
 * process makes, but its call and the mip chain after it are paid in the frame
 * they are made in; past these, the rest waits for the next frame, so a zoom
 * that suddenly wants a screenful of halvings never pays for it in one. A
 * camera at rest has no frame to protect, and fills the page faster.
 */
export const UPLOAD_BUDGET = {
	moving: { ms: 2, bytes: 8 * 1024 * 1024 },
	resting: { ms: 6, bytes: 32 * 1024 * 1024 },
} as const;

/**
 * Whether a frame has spent its upload budget: never before its first upload,
 * so every frame moves the queue on by one however large that one is.
 */
export function uploadSpent(spent: { ms: number; bytes: number }, budget: { ms: number; bytes: number }): boolean {
	return spent.bytes > 0 && (spent.bytes >= budget.bytes || spent.ms >= budget.ms);
}
