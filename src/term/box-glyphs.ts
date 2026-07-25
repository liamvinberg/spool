/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Box definitions ported from xterm.js `addons/addon-webgl/src/CustomGlyphs.ts`
 * at f447274f430fd22513f6adbf9862d19524471c04. This is deliberately a local
 * table: still SVGs must match xterm without importing renderer internals.
 */

type Weight = 1 | 3;
type Definition = Partial<Record<Weight, string | ((xp: number, yp: number) => string)>>;

const shapes = {
	v: "M.5,0 L.5,1",
	h: "M0,.5 L1,.5",
	tr: "M.5,0 L.5,.5 L1,.5",
	tl: "M.5,0 L.5,.5 L0,.5",
	lb: "M0,.5 L.5,.5 L.5,1",
	rb: "M.5,1 L.5,.5 L1,.5",
	mt: "M.5,.5 L.5,0",
	ml: "M.5,.5 L0,.5",
	mr: "M.5,.5 L1,.5",
	mb: "M.5,.5 L.5,1",
	tt: "M0,.5 L1,.5 M.5,.5 L.5,0",
	tleft: "M.5,0 L.5,1 M.5,.5 L0,.5",
	tright: "M.5,0 L.5,1 M.5,.5 L1,.5",
	tbottom: "M0,.5 L1,.5 M.5,.5 L.5,1",
	cross: "M0,.5 L1,.5 M.5,0 L.5,1",
	dh2: "M.1,.5 L.4,.5 M.6,.5 L.9,.5",
	dh3: "M.0667,.5 L.2667,.5 M.4,.5 L.6,.5 M.7333,.5 L.9333,.5",
	dh4: "M.05,.5 L.2,.5 M.3,.5 L.45,.5 M.55,.5 L.7,.5 M.8,.5 L.95,.5",
	dv2: "M.5,.1 L.5,.4 M.5,.6 L.5,.9",
	dv3: "M.5,.0667 L.5,.2667 M.5,.4 L.5,.6 M.5,.7333 L.5,.9333",
	dv4: "M.5,.05 L.5,.2 M.5,.3 L.5,.45 L.5,.55 M.5,.7 L.5,.95",
} as const;

const definitions: Record<string, Definition> = {};
const add = (chars: string, weight: Weight, path: string): void => {
	for (const char of chars) {
		const definition = definitions[char] ?? {};
		definition[weight] = path;
		definitions[char] = definition;
	}
};
const addPair = (char: string, normal: string, bold: string): void => {
	definitions[char] = { 1: normal, 3: bold };
};

// Uniform normal and bold. This grouping is only syntax compression; each
// entry below is xterm's normalized U+2500–U+257F definition.
add("─", 1, shapes.h);
add("━", 3, shapes.h);
add("│", 1, shapes.v);
add("┃", 3, shapes.v);
add("┌", 1, shapes.rb);
add("┏", 3, shapes.rb);
add("┐", 1, shapes.lb);
add("┓", 3, shapes.lb);
add("└", 1, shapes.tr);
add("┗", 3, shapes.tr);
add("┘", 1, shapes.tl);
add("┛", 3, shapes.tl);
add("├", 1, shapes.tright);
add("┣", 3, shapes.tright);
add("┤", 1, shapes.tleft);
add("┫", 3, shapes.tleft);
add("┬", 1, shapes.tbottom);
add("┳", 3, shapes.tbottom);
add("┴", 1, shapes.tt);
add("┻", 3, shapes.tt);
add("┼", 1, shapes.cross);
add("╋", 3, shapes.cross);
add("╴", 1, shapes.ml);
add("╸", 3, shapes.ml);
add("╵", 1, shapes.mt);
add("╹", 3, shapes.mt);
add("╶", 1, shapes.mr);
add("╺", 3, shapes.mr);
add("╷", 1, shapes.mb);
add("╻", 3, shapes.mb);

// Double border.
const double = (path: (xp: number, yp: number) => string): Definition => ({ 1: path });
definitions["═"] = double((_x, y) => `M0,${0.5 - y} L1,${0.5 - y} M0,${0.5 + y} L1,${0.5 + y}`);
definitions["║"] = double((x) => `M${0.5 - x},0 L${0.5 - x},1 M${0.5 + x},0 L${0.5 + x},1`);
definitions["╒"] = double((_x, y) => `M.5,1 L.5,${0.5 - y} L1,${0.5 - y} M.5,${0.5 + y} L1,${0.5 + y}`);
definitions["╓"] = double((x) => `M${0.5 - x},1 L${0.5 - x},.5 L1,.5 M${0.5 + x},.5 L${0.5 + x},1`);
definitions["╔"] = double(
	(x, y) => `M1,${0.5 - y} L${0.5 - x},${0.5 - y} L${0.5 - x},1 M1,${0.5 + y} L${0.5 + x},${0.5 + y} L${0.5 + x},1`,
);
definitions["╕"] = double((_x, y) => `M0,${0.5 - y} L.5,${0.5 - y} L.5,1 M0,${0.5 + y} L.5,${0.5 + y}`);
definitions["╖"] = double((x) => `M${0.5 + x},1 L${0.5 + x},.5 L0,.5 M${0.5 - x},.5 L${0.5 - x},1`);
definitions["╗"] = double(
	(x, y) => `M0,${0.5 + y} L${0.5 - x},${0.5 + y} L${0.5 - x},1 M0,${0.5 - y} L${0.5 + x},${0.5 - y} L${0.5 + x},1`,
);
definitions["╘"] = double((_x, y) => `M.5,0 L.5,${0.5 + y} L1,${0.5 + y} M.5,${0.5 - y} L1,${0.5 - y}`);
definitions["╙"] = double((x) => `M1,.5 L${0.5 - x},.5 L${0.5 - x},0 M${0.5 + x},.5 L${0.5 + x},0`);
definitions["╚"] = double(
	(x, y) => `M1,${0.5 - y} L${0.5 + x},${0.5 - y} L${0.5 + x},0 M1,${0.5 + y} L${0.5 - x},${0.5 + y} L${0.5 - x},0`,
);
definitions["╛"] = double((_x, y) => `M0,${0.5 + y} L.5,${0.5 + y} L.5,0 M0,${0.5 - y} L.5,${0.5 - y}`);
definitions["╜"] = double((x) => `M0,.5 L${0.5 + x},.5 L${0.5 + x},0 M${0.5 - x},.5 L${0.5 - x},0`);
definitions["╝"] = double(
	(x, y) => `M0,${0.5 - y} L${0.5 - x},${0.5 - y} L${0.5 - x},0 M0,${0.5 + y} L${0.5 + x},${0.5 + y} L${0.5 + x},0`,
);
definitions["╞"] = double((_x, y) => `${shapes.v} M.5,${0.5 - y} L1,${0.5 - y} M.5,${0.5 + y} L1,${0.5 + y}`);
definitions["╟"] = double((x) => `M${0.5 - x},0 L${0.5 - x},1 M${0.5 + x},0 L${0.5 + x},1 M${0.5 + x},.5 L1,.5`);
definitions["╠"] = double(
	(x, y) =>
		`M${0.5 - x},0 L${0.5 - x},1 M1,${0.5 + y} L${0.5 + x},${0.5 + y} L${0.5 + x},1 M1,${0.5 - y} L${0.5 + x},${0.5 - y} L${0.5 + x},0`,
);
definitions["╡"] = double((_x, y) => `${shapes.v} M0,${0.5 - y} L.5,${0.5 - y} M0,${0.5 + y} L.5,${0.5 + y}`);
definitions["╢"] = double((x) => `M0,.5 L${0.5 - x},.5 M${0.5 - x},0 L${0.5 - x},1 M${0.5 + x},0 L${0.5 + x},1`);
definitions["╣"] = double(
	(x, y) =>
		`M${0.5 + x},0 L${0.5 + x},1 M0,${0.5 + y} L${0.5 - x},${0.5 + y} L${0.5 - x},1 M0,${0.5 - y} L${0.5 - x},${0.5 - y} L${0.5 - x},0`,
);
definitions["╤"] = double((_x, y) => `M0,${0.5 - y} L1,${0.5 - y} M0,${0.5 + y} L1,${0.5 + y} M.5,${0.5 + y} L.5,1`);
definitions["╥"] = double((x) => `${shapes.h} M${0.5 - x},.5 L${0.5 - x},1 M${0.5 + x},.5 L${0.5 + x},1`);
definitions["╦"] = double(
	(x, y) =>
		`M0,${0.5 - y} L1,${0.5 - y} M0,${0.5 + y} L${0.5 - x},${0.5 + y} L${0.5 - x},1 M1,${0.5 + y} L${0.5 + x},${0.5 + y} L${0.5 + x},1`,
);
definitions["╧"] = double((_x, y) => `M.5,0 L.5,${0.5 - y} M0,${0.5 - y} L1,${0.5 - y} M0,${0.5 + y} L1,${0.5 + y}`);
definitions["╨"] = double((x) => `${shapes.h} M${0.5 - x},.5 L${0.5 - x},0 M${0.5 + x},.5 L${0.5 + x},0`);
definitions["╩"] = double(
	(x, y) =>
		`M0,${0.5 + y} L1,${0.5 + y} M0,${0.5 - y} L${0.5 - x},${0.5 - y} L${0.5 - x},0 M1,${0.5 - y} L${0.5 + x},${0.5 - y} L${0.5 + x},0`,
);
definitions["╪"] = double((_x, y) => `${shapes.v} M0,${0.5 - y} L1,${0.5 - y} M0,${0.5 + y} L1,${0.5 + y}`);
definitions["╫"] = double((x) => `${shapes.h} M${0.5 - x},0 L${0.5 - x},1 M${0.5 + x},0 L${0.5 + x},1`);
definitions["╬"] = double(
	(x, y) =>
		`M0,${0.5 + y} L${0.5 - x},${0.5 + y} L${0.5 - x},1 M1,${0.5 + y} L${0.5 + x},${0.5 + y} L${0.5 + x},1 M0,${0.5 - y} L${0.5 - x},${0.5 - y} L${0.5 - x},0 M1,${0.5 - y} L${0.5 + x},${0.5 - y} L${0.5 + x},0`,
);

add("╱", 1, "M1,0 L0,1");
add("╲", 1, "M0,0 L1,1");
add("╳", 1, "M1,0 L0,1 M0,0 L1,1");

// Mixed weight.
addPair("╼", shapes.ml, shapes.mr);
addPair("╽", shapes.mt, shapes.mb);
addPair("╾", shapes.mr, shapes.ml);
addPair("╿", shapes.mb, shapes.mt);
addPair("┍", shapes.mb, shapes.mr);
addPair("┎", shapes.mr, shapes.mb);
addPair("┑", shapes.mb, shapes.ml);
addPair("┒", shapes.ml, shapes.mb);
addPair("┕", shapes.mt, shapes.mr);
addPair("┖", shapes.mr, shapes.mt);
addPair("┙", shapes.mt, shapes.ml);
addPair("┚", shapes.ml, shapes.mt);
addPair("┝", shapes.v, shapes.mr);
addPair("┞", shapes.rb, shapes.mt);
addPair("┟", shapes.tr, shapes.mb);
addPair("┠", shapes.mr, shapes.v);
addPair("┡", shapes.mb, shapes.tr);
addPair("┢", shapes.mt, shapes.rb);
addPair("┥", shapes.v, shapes.ml);
addPair("┦", shapes.lb, shapes.mt);
addPair("┧", shapes.tl, shapes.mb);
addPair("┨", shapes.ml, shapes.v);
addPair("┩", shapes.mb, shapes.tl);
addPair("┪", shapes.mt, shapes.lb);
addPair("┭", shapes.rb, shapes.ml);
addPair("┮", shapes.lb, shapes.mr);
addPair("┯", shapes.mb, shapes.h);
addPair("┰", shapes.h, shapes.mb);
addPair("┱", shapes.mr, shapes.lb);
addPair("┲", shapes.ml, shapes.rb);
addPair("┵", shapes.tr, shapes.ml);
addPair("┶", shapes.tl, shapes.mr);
addPair("┷", shapes.mt, shapes.h);
addPair("┸", shapes.h, shapes.mt);
addPair("┹", shapes.mr, shapes.tl);
addPair("┺", shapes.ml, shapes.tr);
addPair("┽", `${shapes.v} ${shapes.mr}`, shapes.ml);
addPair("┾", `${shapes.v} ${shapes.ml}`, shapes.mr);
addPair("┿", shapes.v, shapes.h);
addPair("╀", `${shapes.h} ${shapes.mb}`, shapes.mt);
addPair("╁", `${shapes.mt} ${shapes.h}`, shapes.mb);
addPair("╂", shapes.h, shapes.v);
addPair("╃", shapes.rb, shapes.tl);
addPair("╄", shapes.lb, shapes.tr);
addPair("╅", shapes.tr, shapes.lb);
addPair("╆", shapes.tl, shapes.rb);
addPair("╇", shapes.mb, `${shapes.mt} ${shapes.h}`);
addPair("╈", shapes.mt, `${shapes.h} ${shapes.mb}`);
addPair("╉", shapes.mr, `${shapes.v} ${shapes.ml}`);
addPair("╊", shapes.ml, `${shapes.v} ${shapes.mr}`);

add("╌", 1, shapes.dh2);
add("╍", 3, shapes.dh2);
add("┄", 1, shapes.dh3);
add("┅", 3, shapes.dh3);
add("┈", 1, shapes.dh4);
add("┉", 3, shapes.dh4);
add("╎", 1, shapes.dv2);
add("╏", 3, shapes.dv2);
add("┆", 1, shapes.dv3);
add("┇", 3, shapes.dv3);
add("┊", 1, shapes.dv4);
add("┋", 3, shapes.dv4);
definitions["╭"] = double((_x, y) => `M.5,1 L.5,${0.5 + (y / 0.15) * 0.5} C.5,${0.5 + (y / 0.15) * 0.5},.5,.5,1,.5`);
definitions["╮"] = double((_x, y) => `M.5,1 L.5,${0.5 + (y / 0.15) * 0.5} C.5,${0.5 + (y / 0.15) * 0.5},.5,.5,0,.5`);
definitions["╯"] = double((_x, y) => `M.5,0 L.5,${0.5 - (y / 0.15) * 0.5} C.5,${0.5 - (y / 0.15) * 0.5},.5,.5,0,.5`);
definitions["╰"] = double((_x, y) => `M.5,0 L.5,${0.5 - (y / 0.15) * 0.5} C.5,${0.5 - (y / 0.15) * 0.5},.5,.5,1,.5`);

export const boxGlyphs = Array.from({ length: 128 }, (_, index) => String.fromCodePoint(0x2500 + index));

export function isBoxGlyph(char: string): boolean {
	return definitions[char] !== undefined;
}

export interface BoxGlyphPath {
	d: string;
	strokeWidth: Weight;
	paths: ReadonlyArray<{ d: string; strokeWidth: Weight }>;
}

/** Translate xterm's normalized M/L/C primitives to one absolute SVG cell. */
export function boxGlyphPath(
	char: string,
	cellWidth: number,
	cellHeight: number,
	x: number,
	y: number,
): BoxGlyphPath | undefined {
	const definition = definitions[char];
	if (definition === undefined) return undefined;
	const paths: Array<{ d: string; strokeWidth: Weight }> = [];
	let strokeWidth: Weight = 1;
	for (const weight of [1, 3] as const) {
		const source = definition[weight];
		if (source === undefined) continue;
		const xp = 0.15;
		const yp = (0.15 / cellHeight) * cellWidth;
		paths.push({
			d: absolute(typeof source === "function" ? source(xp, yp) : source, cellWidth, cellHeight, x, y),
			strokeWidth: weight,
		});
		strokeWidth = Math.max(strokeWidth, weight) as Weight;
	}
	return { d: paths.map((path) => path.d).join(" "), strokeWidth, paths };
}

function absolute(path: string, width: number, height: number, offsetX: number, offsetY: number): string {
	return path.replace(/([MLC])((?:-?(?:\d+\.?\d*|\.\d+),?)+)/g, (_whole, command: string, values: string) => {
		const numbers = values.split(",").map(Number);
		return `${command}${numbers
			.map((value, index) => {
				const size = index % 2 === 0 ? width : height;
				const offset = index % 2 === 0 ? offsetX : offsetY;
				let translated = value * size;
				if (translated !== 0) translated = clamp(Math.round(translated + 0.5) - 0.5, size);
				return offset + translated;
			})
			.join(",")}`;
	});
}

function clamp(value: number, max: number): number {
	return Math.max(Math.min(value, max), 0);
}

if (boxGlyphs.some((glyph) => definitions[glyph] === undefined)) {
	throw new Error("spool: incomplete xterm box glyph table");
}
