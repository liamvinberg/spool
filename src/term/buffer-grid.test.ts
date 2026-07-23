import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { gridFromBuffer } from "./buffer-grid";
import { TERM_ANSI, TERM_BACKGROUND, TERM_FOREGROUND } from "./theme";

async function screen(data: string, cols = 12, rows = 3): Promise<Terminal> {
	const term = new Terminal({ cols, rows, allowProposedApi: true });
	await new Promise<void>((resolve) => term.write(data, resolve));
	return term;
}

describe("gridFromBuffer", () => {
	it("reads plain text as one default-colored run", async () => {
		const grid = gridFromBuffer(await screen("hi"));
		expect(grid.cols).toBe(12);
		expect(grid.rows).toBe(3);
		expect(grid.lines[0]?.[0]).toMatchObject({ text: "hi", fg: TERM_FOREGROUND });
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

	it("coalesces same-styled neighbors into one run", async () => {
		const line = gridFromBuffer(await screen("ab\x1b[31mcd")).lines[0];
		expect(line?.map((r) => r.text)).toEqual(["ab", "cd"]);
	});

	it("renders an untouched line as no runs", async () => {
		expect(gridFromBuffer(await screen("hi")).lines[2]).toEqual([]);
	});
});
