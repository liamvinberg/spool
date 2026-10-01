import { STREAM } from "./sources";

/** What a cell is, written to the grid texture's blue channel. */
export const KIND = { loose: 0, shape: 1, edge: 2, name: 3, hot: 4, print: 5 } as const;
type Kind = (typeof KIND)[keyof typeof KIND];

export type Grid = {
	cols: number;
	rows: number;
	cell: [number, number];
	/** RGBA per cell: character, ask, kind, trail. Uploaded every drawn frame. */
	data: Uint8Array;
	/** The loose source the field starts every frame from. */
	template: Uint8Array;
	/** The cursor's trail, 0 to 1 per cell, decaying. */
	trail: Float32Array;
};

const COLUMN = 46;
const GUTTER = 4;

/** Lay the source out in newspaper columns across the whole grid. */
export function createGrid(width: number, height: number, cell: [number, number]): Grid {
	const cols = Math.ceil(width / cell[0]);
	const rows = Math.ceil(height / cell[1]);
	const template = new Uint8Array(cols * rows * 4);
	const stride = COLUMN + GUTTER;
	for (let col = 0; col < cols; col++) {
		const column = Math.floor(col / stride);
		const within = col % stride;
		for (let row = 0; row < rows; row++) {
			const line = STREAM[(column * 37 + row) % STREAM.length] ?? "";
			const char = within < COLUMN ? line.charCodeAt(within) : 32;
			template[(row * cols + col) * 4] = Number.isNaN(char) || char < 32 || char > 126 ? 32 : char;
		}
	}
	return { cols, rows, cell, data: new Uint8Array(template.length), template, trail: new Float32Array(cols * rows) };
}

/** Start a frame of the field from the loose source. */
export function reset(grid: Grid) {
	grid.data.set(grid.template);
}

/** Ask for one cell. A louder ask wins; the character only changes when one is given. */
export function put(grid: Grid, col: number, row: number, kind: Kind, ask: number, char?: number) {
	if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows || ask <= 0) return;
	const i = (row * grid.cols + col) * 4;
	const level = Math.round(Math.min(1, ask) * 255);
	if (level < (grid.data[i + 1] ?? 0) && kind === (grid.data[i + 2] ?? 0)) return;
	if (char !== undefined) grid.data[i] = char;
	grid.data[i + 1] = level;
	grid.data[i + 2] = kind;
}

/** Print a line of text into the grid, up to `shown` characters of it. */
export function print(grid: Grid, col: number, row: number, text: string, kind: Kind, ask: number, shown = text.length) {
	for (let k = 0; k < Math.min(shown, text.length); k++) {
		const char = text.charCodeAt(k);
		put(grid, col + k, row, kind, ask, char < 32 || char > 126 ? 32 : char);
	}
}

/** Fold the cursor's trail into the alpha channel. */
export function writeTrail(grid: Grid) {
	const { trail, data } = grid;
	for (let i = 0; i < trail.length; i++) data[i * 4 + 3] = Math.round(Math.min(1, trail[i] ?? 0) * 255);
}

const DENSE = "{<Sheet/>}=>(step)[i]+useState;Field?:.map";

/** A shape measured per cell: how much of each cell the ink covers. `draw` paints in CSS pixels. */
export function coverage(grid: Grid, draw: (ctx: CanvasRenderingContext2D) => void) {
	const [cw, ch] = grid.cell;
	const sub = 4;
	const canvas = document.createElement("canvas");
	canvas.width = grid.cols * sub;
	canvas.height = grid.rows * sub;
	const out = new Float32Array(grid.cols * grid.rows);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return out;
	// Canvas pixels per CSS pixel differ by axis, because cells are taller than wide.
	ctx.setTransform(sub / cw, 0, 0, sub / ch, 0, 0);
	ctx.fillStyle = "#fff";
	draw(ctx);
	const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			let sum = 0;
			for (let y = 0; y < sub; y++) {
				for (let x = 0; x < sub; x++) sum += pixels[((row * sub + y) * canvas.width + col * sub + x) * 4 + 3] ?? 0;
			}
			out[row * grid.cols + col] = sum / (sub * sub * 255);
		}
	}
	return out;
}

type Box = { x: number; y: number; w: number; h: number };

/** Set a word in a heavy grotesk, as large as fits the box, centred in it. */
export function word(text: string, box: Box) {
	return (ctx: CanvasRenderingContext2D) => {
		ctx.font = `700 ${box.h}px "Familjen Grotesk", Arial, sans-serif`;
		const size = Math.min(box.h, (box.h * box.w) / Math.max(1, ctx.measureText(text).width));
		ctx.font = `700 ${size}px "Familjen Grotesk", Arial, sans-serif`;
		const fit = ctx.measureText(text);
		const ascent = fit.actualBoundingBoxAscent;
		const descent = fit.actualBoundingBoxDescent;
		ctx.fillText(text, box.x + (box.w - fit.width) / 2, box.y + (box.h + ascent - descent) / 2);
	};
}

/** Draw an SVG path from its viewBox, as large as fits the box, centred in it. */
export function shape(d: string, view: [number, number, number, number], box: Box) {
	return (ctx: CanvasRenderingContext2D) => {
		const [vx, vy, vw, vh] = view;
		const scale = Math.min(box.w / vw, box.h / vh);
		ctx.translate(box.x + (box.w - vw * scale) / 2, box.y + (box.h - vh * scale) / 2);
		ctx.scale(scale, scale);
		ctx.translate(-vx, -vy);
		ctx.fill(new Path2D(d), "evenodd");
	};
}

/** The character a shape cell shows where the source has a space, so a shape reads solid. */
export function dense(col: number, row: number) {
	return DENSE.charCodeAt((col + row * 7) % DENSE.length);
}
