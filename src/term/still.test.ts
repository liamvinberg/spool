import { describe, expect, it } from "vitest";
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

describe("gridToSvg", () => {
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
				`<text x="0" y="13.5" textLength="${CELL_W}" lengthAdjust="spacingAndGlyphs" ` +
				'font-family="JetBrains Mono, monospace" font-size="15" fill="#d8d6d0">x</text>' +
				"</svg>",
		);
	});
});
