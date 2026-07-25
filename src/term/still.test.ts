import { describe, expect, it } from "vitest";
import { boxGlyphPath, boxGlyphs } from "./box-glyphs";
import { CELL_H, CELL_W } from "./cells";
import type { Grid } from "./still";
import { gridToSvg } from "./still";

const tiny: Grid = {
	cols: 4,
	rows: 2,
	lines: [
		[{ text: "hi", fg: "#d8d6d0" }],
		[
			{ text: ">", fg: "#7dc4a5", bold: true },
			{ text: "_", fg: "#d8d6d0", bg: "#3a3a37" },
		],
	],
};

function boundaryEdges(char: string): string {
	const d = boxGlyphPath(char, CELL_W, CELL_H, 0, 0)?.d ?? "";
	const edges = new Set<string>();
	for (const instruction of d.split(" ")) {
		const values = instruction
			.slice(1)
			.split(",")
			.map((value) => Number(value));
		for (let index = 0; index < values.length; index += 2) {
			const x = values[index] as number;
			const y = values[index + 1] as number;
			if (x === 0 && y > 0 && y < CELL_H) edges.add("L");
			if (x === CELL_W && y > 0 && y < CELL_H) edges.add("R");
			if (y === 0 && x > 0 && x < CELL_W) edges.add("T");
			if (y === CELL_H && x > 0 && x < CELL_W) edges.add("B");
		}
	}
	return [...edges].sort().join("");
}

const expectedBoundaryEdges = [
	"LR LR BT BT - - - - - - - - BR BR BR BR",
	"BL BL BL BL RT RT RT RT LT LT LT LT BRT BRT BRT BRT",
	"BRT BRT BRT BRT BLT BLT BLT BLT BLT BLT BLT BLT BLR BLR BLR BLR",
	"BLR BLR BLR BLR LRT LRT LRT LRT LRT LRT LRT LRT BLRT BLRT BLRT BLRT",
	"BLRT BLRT BLRT BLRT BLRT BLRT BLRT BLRT BLRT BLRT BLRT BLRT - - - -",
	"LR BT BR BR BR BL BL BL RT RT RT LT LT LT BRT BRT",
	"BRT BLT BLT BLT BLR BLR BLR LRT LRT LRT BLRT BLRT BLRT BR BL LT",
	"RT - - - L T R B L T R B LR BT LR BT",
].flatMap((row) => row.split(" "));

describe("gridToSvg", () => {
	it("renders every box drawing cell as a boundary-aware vector, not font text", () => {
		expect(boxGlyphs).toHaveLength(128);
		for (let codePoint = 0x2500; codePoint <= 0x257f; codePoint++) {
			const glyph = String.fromCodePoint(codePoint);
			const path = boxGlyphPath(glyph, CELL_W, CELL_H, 0, 0);
			expect(path, `U+${codePoint.toString(16)}`).toMatchObject({ d: expect.stringMatching(/^M/) });
			expect(path?.d).not.toMatch(/NaN|undefined/);
		}
		const svg = gridToSvg({
			cols: 3,
			rows: 1,
			lines: [
				[
					{ text: "┌", width: 1, fg: "#d8d6d0", box: true },
					{ text: "─", width: 1, fg: "#d8d6d0", box: true },
					{ text: "┐", width: 1, fg: "#d8d6d0", box: true },
				],
			],
		});
		expect(svg).toContain("<path");
		expect(svg).not.toContain(">┌─┐</text>");
	});

	it("gives all 128 glyphs their official boundary connections", () => {
		expect(expectedBoundaryEdges).toHaveLength(128);
		for (const [index, expected] of expectedBoundaryEdges.entries()) {
			const char = String.fromCodePoint(0x2500 + index);
			expect(boundaryEdges(char), `U+${(0x2500 + index).toString(16)} ${char}`).toBe(
				expected === "-" ? "" : expected,
			);
		}
	});

	it("keeps official dashed gaps and half-line endings intentional", () => {
		for (const char of "┄┅┆┇┈┉┊┋╌╍╎╏") {
			expect(boundaryEdges(char), `${char} is internally dashed`).toBe("");
		}
		expect(Object.fromEntries("╴╵╶╷╸╹╺╻╼╽╾╿".split("").map((char) => [char, boundaryEdges(char)]))).toEqual({
			"╴": "L",
			"╵": "T",
			"╶": "R",
			"╷": "B",
			"╸": "L",
			"╹": "T",
			"╺": "R",
			"╻": "B",
			"╼": "LR",
			"╽": "BT",
			"╾": "LR",
			"╿": "BT",
		});
	});

	it("matches xterm's clamped half-pixel geometry in a 9 by 20 cell", () => {
		expect(boxGlyphPath("─", CELL_W, CELL_H, 0, 0)?.d).toBe("M0,10.5 L9,10.5");
		expect(boxGlyphPath("═", CELL_W, CELL_H, 0, 0)?.d).toBe("M0,8.5 L9,8.5 M0,11.5 L9,11.5");
		expect(boxGlyphPath("║", CELL_W, CELL_H, 0, 0)?.d).toBe("M3.5,0 L3.5,20 M5.5,0 L5.5,20");
	});

	it("paints every cell background before foreground box paths", () => {
		const svg = gridToSvg({
			cols: 2,
			rows: 1,
			lines: [
				[
					{ text: "─", fg: "#fff", bg: "#123456", box: true },
					{ text: "x", fg: "#fff", bg: "#654321" },
				],
			],
		});
		expect(svg.indexOf('fill="#654321"')).toBeLessThan(svg.indexOf("<path"));
	});

	it("draws one underline after a normal underlined box cell", () => {
		const svg = gridToSvg({
			cols: 1,
			rows: 1,
			lines: [[{ text: "─", width: 1, fg: "#d8d6d0", underline: true, box: true }]],
		});
		const glyph = 'd="M0,10.5 L9,10.5" fill="none" stroke="#d8d6d0" stroke-width="1"';
		const underline = 'd="M0,19.5 L9,19.5" fill="none" stroke="#d8d6d0" stroke-width="1"';
		expect(svg).toContain(glyph);
		expect(svg).toContain(underline);
		expect(svg.indexOf(glyph)).toBeLessThan(svg.indexOf(underline));
		expect(svg.match(/stroke="#d8d6d0"/g)).toHaveLength(2);
	});

	it("keeps ordinary unicode, a wide neighbor, text styles, and the cursor beside box vectors", () => {
		const svg = gridToSvg({
			cols: 7,
			rows: 1,
			cursor: { col: 6, row: 0, cell: { text: " ", width: 1, fg: "#d8d6d0" } },
			lines: [
				[
					{
						text: "你x",
						width: 3,
						fg: "#aabbcc",
						bg: "#123456",
						bold: true,
						italic: true,
						underline: true,
						dim: true,
					},
					{ text: "─", width: 1, fg: "#aabbcc", bg: "#123456", dim: true, box: true },
					{
						text: "<&",
						width: 2,
						fg: "#aabbcc",
						bg: "#123456",
						bold: true,
						italic: true,
						underline: true,
						dim: true,
					},
				],
			],
		});
		expect(svg).toContain('textLength="27"');
		expect(svg).toContain('d="M27,10.5 L36,10.5"');
		expect(svg).toContain('font-weight="700" font-style="italic" text-decoration="underline" opacity="0.5"');
		expect(svg).toContain("你x");
		expect(svg).toContain("&lt;&amp;");
		expect(svg).toContain(`<rect x="${6 * CELL_W}" y="0" width="${CELL_W}" height="${CELL_H}" fill="#f0efeb"/>`);
	});

	it("renders the focused block cursor opaquely and redraws its ordinary glyph in cursor accent", () => {
		const svg = gridToSvg({
			cols: 1,
			rows: 1,
			lines: [
				[
					{
						text: "x",
						width: 1,
						fg: "#d8d6d0",
						bold: true,
						italic: true,
						underline: true,
						dim: true,
					},
				],
			],
			cursor: {
				col: 0,
				row: 0,
				cell: {
					text: "x",
					width: 1,
					fg: "#d8d6d0",
					bold: true,
					italic: true,
					underline: true,
					dim: true,
				},
			},
		});
		expect(svg).toContain(`<rect x="0" y="0" width="${CELL_W}" height="${CELL_H}" fill="#f0efeb"/>`);
		expect(svg).toContain(
			'fill="#d8d6d0" font-weight="700" font-style="italic" text-decoration="underline" opacity="0.5"',
		);
		const cursorLayer = svg.slice(svg.lastIndexOf('<rect x="0"'));
		expect(cursorLayer).toContain(`font-size="15" fill="#111110">x</text>`);
		expect(cursorLayer).not.toMatch(/font-weight|font-style|text-decoration|opacity/);
		expect(svg).not.toContain('opacity="0.75"');
	});

	it("redraws a box glyph over the focused cursor using cursor accent geometry", () => {
		const svg = gridToSvg({
			cols: 1,
			rows: 1,
			lines: [[{ text: "─", width: 1, fg: "#d8d6d0", underline: true, dim: true, box: true }]],
			cursor: {
				col: 0,
				row: 0,
				cell: { text: "─", width: 1, fg: "#d8d6d0", underline: true, dim: true, box: true },
			},
		});
		expect(svg).toContain(`<rect x="0" y="0" width="${CELL_W}" height="${CELL_H}" fill="#f0efeb"/>`);
		const cursorLayer = svg.slice(svg.lastIndexOf('<rect x="0"'));
		expect(cursorLayer).toContain(`d="M0,10.5 L9,10.5" fill="none" stroke="#111110" stroke-width="1"`);
		expect(cursorLayer).not.toContain("M0,19.5");
		expect(cursorLayer).not.toContain("opacity");
	});
	it("sizes the still to the exact cell grid", () => {
		const svg = gridToSvg(tiny);
		expect(svg).toContain(`viewBox="0 0 ${4 * CELL_W} ${2 * CELL_H}"`);
		expect(svg).toContain(`width="${4 * CELL_W}"`);
		expect(svg).toContain(`height="${2 * CELL_H}"`);
	});

	it("paints the pinned dark background under every cell", () => {
		expect(gridToSvg(tiny)).toContain('<rect width="100%" height="100%" fill="#111110"/>');
	});

	it("pins every run to its grid column with a forced advance", () => {
		const svg = gridToSvg(tiny);
		expect(svg).toContain(`textLength="${2 * CELL_W}"`);
		expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
		expect(svg).toContain(`x="${CELL_W}"`);
	});

	it("draws a run's background as a cell-aligned rect", () => {
		const svg = gridToSvg(tiny);
		expect(svg).toContain(`<rect x="${CELL_W}" y="${CELL_H}" width="${CELL_W}" height="${CELL_H}" fill="#3a3a37"/>`);
	});

	it("carries bold through as font weight", () => {
		expect(gridToSvg(tiny)).toContain('font-weight="700"');
	});

	it("escapes text content", () => {
		const grid: Grid = { cols: 8, rows: 1, lines: [[{ text: "<a&b>", fg: "#fff" }]] };
		const svg = gridToSvg(grid);
		expect(svg).toContain("&lt;a&amp;b&gt;");
		expect(svg).not.toContain("<a&b>");
	});

	it("embeds the pinned font when given one, and omits the style block otherwise", () => {
		const fontCss = '@font-face{font-family:"JetBrains Mono";src:url(data:font/woff2;base64,TEST)}';
		expect(gridToSvg(tiny, fontCss)).toContain(fontCss);
		expect(gridToSvg(tiny)).not.toContain("<style>");
	});

	it("renders a stable golden for a one-cell grid", () => {
		const grid: Grid = { cols: 1, rows: 1, lines: [[{ text: "x", fg: "#d8d6d0" }]] };
		expect(gridToSvg(grid)).toBe(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}" viewBox="0 0 ${CELL_W} ${CELL_H}">` +
				'<rect width="100%" height="100%" fill="#111110"/>' +
				`<text x="0" y="15" textLength="${CELL_W}" lengthAdjust="spacingAndGlyphs" ` +
				'font-family="JetBrains Mono, monospace" font-size="15" fill="#d8d6d0">x</text>' +
				"</svg>",
		);
	});
});
