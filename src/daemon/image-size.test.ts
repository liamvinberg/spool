import { describe, expect, it } from "vitest";
import { imageSize, oversizedImages } from "./image-size";

/** Just enough of each kind's header to name a 5000×300 image. */
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const HEADERS: Record<string, number[]> = {
	"hero.png": [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, ...ascii("IHDR"), ...be32(5000), ...be32(300)],
	"hero.gif": [...ascii("GIF89a"), ...le16(5000), ...le16(300)],
	"hero.jpg": [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc2, 0, 11, 8, 300 >> 8, 300 & 255, 5000 >> 8, 5000 & 255],
	"lossy.webp": [
		...ascii("RIFF"),
		0,
		0,
		0,
		0,
		...ascii("WEBPVP8 "),
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		...le16(5000),
		...le16(300),
	],
	"lossless.webp": [
		...ascii("RIFF"),
		0,
		0,
		0,
		0,
		...ascii("WEBPVP8L"),
		0,
		0,
		0,
		0,
		0x2f,
		// 14 bits of width - 1, then 14 of height - 1, little-endian
		4999 & 255,
		((4999 >> 8) & 0x3f) | ((299 & 3) << 6),
		(299 >> 2) & 255,
		(299 >> 10) & 0xf,
	],
	"extended.webp": [
		...ascii("RIFF"),
		0,
		0,
		0,
		0,
		...ascii("WEBPVP8X"),
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		...le24(4999),
		...le24(299),
	],
};

describe("an image's size, from its header", () => {
	it.each(Object.keys(HEADERS))("reads %s", (name) => {
		expect(imageSize(name, Uint8Array.from(HEADERS[name] ?? []))).toEqual({ width: 5000, height: 300 });
	});

	it("reads nothing from an svg or a header cut short", () => {
		expect(imageSize("logo.svg", new TextEncoder().encode("<svg width='9000'/>"))).toBeUndefined();
		expect(imageSize("hero.png", Uint8Array.from(HEADERS["hero.png"]?.slice(0, 20) ?? []))).toBeUndefined();
	});
});

describe("a frame's oversized images", () => {
	const asset = (path: string, size: number, width: number, height: number) => ({
		url: "/asset/x.png",
		hash: "x",
		type: "image/png",
		path,
		size,
		width,
		height,
	});

	it("names each image too big to load as it is, and the fix", () => {
		const warning = oversizedImages([
			asset("frames/home/fine.png", 900_000, 2400, 1600),
			asset("frames/home/wide.png", 900_000, 6000, 4000),
			asset("shared/assets/heavy.png", 7_200_000, 1200, 800),
		]);
		expect(warning).toBe(
			"images served as they are, and too big for it: design/frames/home/wide.png (6000×4000 px), design/shared/assets/heavy.png (7 MB). Save each web-sized: about 2400 px on its longest side for a photo, never over 4096, and a few MB at most",
		);
		expect(oversizedImages([asset("frames/home/fine.png", 900_000, 2400, 1600)])).toBeUndefined();
	});
});
