/**
 * The cloth's layout in threads, mirrored by loom.glsl. Rows run down the page:
 * a dark heading, a few red picks, one pick per line of the file the agent writes,
 * the figure of four frames and the walk between them, then the pigment band.
 */
export const W = 96;
export const ROWS = 130;
export const LINES = 6;
export const FIG = 24;
export const PIG = 68;

export type ClothFrame = { name: string; x0: number; y0: number; x1: number; y1: number };

/* Cells, figure rows already offset to cloth rows. */
export const FRAMES: ClothFrame[] = [
	{ name: "cart", x0: 6, y0: FIG + 13, x1: 26, y1: FIG + 27 },
	{ name: "checkout", x0: 31, y0: FIG + 13, x1: 51, y1: FIG + 27 },
	{ name: "pay", x0: 56, y0: FIG + 9, x1: 66, y1: FIG + 31 },
	{ name: "receipt", x0: 71, y0: FIG + 13, x1: 91, y1: FIG + 27 },
];

/** Where the walk is at x, in cloth rows: under, over, under between the frames' middles. */
export function pathY(x: number) {
	let a = 61,
		b = 81,
		sign = 1;
	if (x < 41) {
		a = 16;
		b = 41;
	} else if (x < 61) {
		a = 41;
		b = 61;
		sign = -1;
	}
	const t = (x - a) / (b - a);
	return FIG + 20 + sign * 13 * Math.sin(Math.PI * t);
}

/* The plain dark patch the closing words sit on, in cells: x0, y0, x1, y1. */
export const PATCH: [number, number, number, number] = [6, PIG + 20, 50, PIG + 48];

export type Box = [number, number, number, number];
export type Shot = { box: Box; screen: Box; cover?: boolean };
export type Camera = { x: number; y: number; pitch: number };

/** Fit a world box into a fraction of the viewport, contained unless the shot asks to cover. */
export function frame(shot: Shot, width: number, height: number): Camera {
	const [x0, y0, x1, y1] = shot.box;
	const [s0, t0, s1, t1] = shot.screen;
	const sw = (s1 - s0) * width;
	const sh = (t1 - t0) * height;
	const fit = shot.cover ? Math.max : Math.min;
	const pitch = fit(sw / (x1 - x0), sh / (y1 - y0));
	// The world point at the screen box's centre sits at the box's centre.
	const cx = (x0 + x1) / 2 - ((s0 + s1) / 2 - 0.5) * (width / pitch);
	const cy = (y0 + y1) / 2 - ((t0 + t1) / 2 - 0.5) * (height / pitch);
	return { x: cx, y: cy, pitch };
}
