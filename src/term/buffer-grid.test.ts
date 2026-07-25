import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { gridFromBuffer } from "./buffer-grid";
import { CELL_W } from "./cells";
import { trackCursorVisibility } from "./cursor-visibility";
import { gridToSvg } from "./still";
import { TERM_ANSI, TERM_BACKGROUND, TERM_FOREGROUND } from "./theme";

async function screen(data: string, cols = 12, rows = 3): Promise<Terminal> {
	const term = new Terminal({ cols, rows, allowProposedApi: true });
	trackCursorVisibility(term);
	await new Promise<void>((resolve) => term.write(data, resolve));
	return term;
}

describe("gridFromBuffer", () => {
	it("refuses an emulator whose DECTCEM state was not attached", () => {
		const term = new Terminal({ cols: 12, rows: 3, allowProposedApi: true });
		expect(() => gridFromBuffer(term)).toThrow("cursor visibility is not tracked");
	});

	it("reads plain text as one default-colored run", async () => {
		const grid = gridFromBuffer(await screen("hi"));
		expect(grid.cols).toBe(12);
		expect(grid.rows).toBe(3);
		expect(grid.lines[0]?.[0]).toMatchObject({ text: "hi", fg: TERM_FOREGROUND });
		expect(grid.cursor).toEqual({
			col: 2,
			row: 0,
			cell: { text: " ", width: 1, fg: TERM_FOREGROUND },
		});
	});

	it("follows DECTCEM when deciding whether the still has a cursor", async () => {
		const term = await screen("x\x1b[?25l");
		expect(gridFromBuffer(term).cursor).toBeUndefined();
		await new Promise<void>((resolve) => term.write("\x1b[?25h", resolve));
		expect(gridFromBuffer(term).cursor).toEqual({
			col: 1,
			row: 0,
			cell: { text: " ", width: 1, fg: TERM_FOREGROUND },
		});
	});

	it("restores the still cursor when DECSTR resets terminal state", async () => {
		const term = await screen("x\x1b[?25l\x1b[!p");
		expect(gridFromBuffer(term).cursor).toEqual({
			col: 1,
			row: 0,
			cell: { text: " ", width: 1, fg: TERM_FOREGROUND },
		});
	});

	it("clamps a wrap-pending cursor to the final cell", async () => {
		const grid = gridFromBuffer(await screen("abcd", 4, 1));
		expect(grid.cursor).toEqual({
			col: 3,
			row: 0,
			cell: { text: "d", width: 1, fg: TERM_FOREGROUND },
		});
		expect(gridToSvg(grid)).toContain(`<rect x="${3 * CELL_W}" y="0" width="${CELL_W}"`);
	});

	it("omits the cursor when xterm leaves it on a wide glyph's width-zero continuation", async () => {
		const term = await screen("你\b");
		expect(term.buffer.active.cursorX).toBe(1);
		expect(term.buffer.active.getLine(0)?.getCell(1)?.getWidth()).toBe(0);
		expect(gridFromBuffer(term).cursor).toBeUndefined();
	});

	it("carries the exact cursor cell for an ordinary and box glyph", async () => {
		expect(gridFromBuffer(await screen("x\b")).cursor?.cell).toEqual({
			text: "x",
			width: 1,
			fg: TERM_FOREGROUND,
		});
		expect(gridFromBuffer(await screen("─\b")).cursor?.cell).toEqual({
			text: "─",
			width: 1,
			fg: TERM_FOREGROUND,
			box: true,
		});
	});

	it("resolves ANSI palette colors through the pinned theme", async () => {
		const grid = gridFromBuffer(await screen("\x1b[31mred"));
		expect(grid.lines[0]?.[0]).toMatchObject({ text: "red", fg: TERM_ANSI[1] });
	});

	it("carries bold and background", async () => {
		const grid = gridFromBuffer(await screen("\x1b[1;44mX"));
		expect(grid.lines[0]?.[0]).toMatchObject({ text: "X", bold: true, bg: TERM_ANSI[4] });
	});

	it("computes the 256-color cube", async () => {
		const grid = gridFromBuffer(await screen("\x1b[38;5;196mX"));
		expect(grid.lines[0]?.[0]?.fg).toBe("#ff0000");
	});

	it("passes truecolor through", async () => {
		const grid = gridFromBuffer(await screen("\x1b[38;2;1;2;3mX"));
		expect(grid.lines[0]?.[0]?.fg).toBe("#010203");
	});

	it("swaps colors for inverse video", async () => {
		const run = gridFromBuffer(await screen("\x1b[7mX")).lines[0]?.[0];
		expect(run).toMatchObject({ fg: TERM_BACKGROUND, bg: TERM_FOREGROUND });
	});

	it("counts a wide glyph's two cells into the run width", async () => {
		const run = gridFromBuffer(await screen("你a")).lines[0];
		expect(run?.[0]).toMatchObject({ text: "你a", width: 3 });
	});

	it.each([
		["e\u0301─", "e\u0301", 1, "combining mark"],
		["👩‍💻─", "👩‍💻", 2, "ZWJ sequence"],
		["你─", "你", 2, "wide glyph"],
	])("keeps a following box on its xterm cell after a %s", async (data, text, width) => {
		const grid = gridFromBuffer(await screen(data));
		expect(grid.lines[0]).toEqual([
			{ text, width, fg: TERM_FOREGROUND },
			{ text: "─", width: 1, fg: TERM_FOREGROUND, box: true },
		]);
		expect(gridToSvg(grid)).toContain(`d="M${width * CELL_W},10.5 L${(width + 1) * CELL_W},10.5"`);
	});

	it("coalesces same-styled neighbors into one run", async () => {
		const line = gridFromBuffer(await screen("ab\x1b[31mcd")).lines[0];
		expect(line?.map((r) => r.text)).toEqual(["ab", "cd"]);
	});

	it("renders an untouched line as no runs", async () => {
		expect(gridFromBuffer(await screen("hi")).lines[2]).toEqual([]);
	});
});
