import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildFramePdf, framesInCanvasOrder, pngBytesFromImageBlob } from "./frame-export";

const PNG_BYTES = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XH1dWQAAAABJRU5ErkJggg==",
		"base64",
	),
);

describe("frame export artifacts", () => {
	it("orders a selection left to right on the canvas", () => {
		const frames = [
			{ name: "receipt", x: 920, y: 100, w: 390, h: 844 },
			{ name: "menu", x: 20, y: 140, w: 390, h: 844 },
			{ name: "cart", x: 470, y: 180, w: 390, h: 844 },
		];

		expect(framesInCanvasOrder(frames, ["cart", "receipt", "menu"]).map((frame) => frame.name)).toEqual([
			"menu",
			"cart",
			"receipt",
		]);
	});

	it("writes one 96-DPI-sized PDF page per captured frame", async () => {
		const bytes = await buildFramePdf([
			{ name: "menu", width: 100, height: 200, png: PNG_BYTES },
			{ name: "cart", width: 300, height: 400, png: PNG_BYTES },
		]);

		expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe("%PDF-1.7");
		const pdf = await PDFDocument.load(bytes);
		expect(pdf.getPageCount()).toBe(2);
		expect(pdf.getPage(0).getSize()).toEqual({ width: 75, height: 150 });
		expect(pdf.getPage(1).getSize()).toEqual({ width: 225, height: 300 });
	});

	it("keeps an existing PNG byte-for-byte", async () => {
		const blob = new Blob([PNG_BYTES], { type: "image/png" });

		expect(await pngBytesFromImageBlob(blob, 100, 200)).toEqual(PNG_BYTES);
	});
});
