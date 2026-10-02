import { describe, expect, it } from "vitest";
import { coverSize } from "./cover-size";

/** A PNG's signature and IHDR chunk, which is all a size read looks at. */
function pngHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(33);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

/** A JPEG whose frame header comes after an APP0 and a quantization table, as an encoder writes them. */
function jpegHeader(width: number, height: number, sof = 0xc0): Uint8Array {
	const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
	const dqt = [0xff, 0xdb, 0, 67, 0, ...new Array<number>(64).fill(1)];
	const frame = [0xff, sof, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3];
	return Uint8Array.from([0xff, 0xd8, ...app0, ...dqt, ...frame, ...new Array<number>(9).fill(0)]);
}

describe("coverSize", () => {
	it("reads a PNG's IHDR", () => {
		expect(coverSize(pngHeader(800, 1731))).toEqual({ width: 800, height: 1731 });
	});

	it("reads a JPEG's frame header past the segments before it", () => {
		expect(coverSize(jpegHeader(800, 533))).toEqual({ width: 800, height: 533 });
	});

	it("reads a progressive JPEG's frame header too", () => {
		expect(coverSize(jpegHeader(800, 600, 0xc2))).toEqual({ width: 800, height: 600 });
	});

	it("does not take a Huffman table for a frame header", () => {
		// DHT is 0xc4, inside the SOF range: reading it as one would report its bytes as a size
		const dht = [0xff, 0xc4, 0, 5, 0x10, 0x20, 0x30];
		const bytes = jpegHeader(640, 480);
		const withTable = Uint8Array.from([0xff, 0xd8, ...dht, ...bytes.slice(2)]);
		expect(coverSize(withTable)).toEqual({ width: 640, height: 480 });
	});

	it("says nothing about a file it cannot read a size from", () => {
		expect(coverSize(new Uint8Array())).toBeUndefined();
		expect(coverSize(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBeUndefined();
		// cut off before the frame header
		expect(coverSize(jpegHeader(800, 533).slice(0, 40))).toBeUndefined();
		// a zero dimension is no picture
		expect(coverSize(pngHeader(0, 10))).toBeUndefined();
	});
});
