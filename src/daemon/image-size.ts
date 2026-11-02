import type { CompiledAsset } from "./design-compile";

/**
 * A raster image's pixel size, read from its header alone: PNG, GIF, JPEG and
 * WebP. Nothing for an SVG, whose size is whatever it is drawn at, or for a
 * header this cannot read.
 */
export function imageSize(file: string, bytes: Uint8Array): { width: number; height: number } | undefined {
	const at = (index: number): number => bytes[index] ?? 0;
	const be16 = (index: number) => (at(index) << 8) | at(index + 1);
	const le16 = (index: number) => at(index) | (at(index + 1) << 8);
	const le24 = (index: number) => le16(index) | (at(index + 2) << 16);
	const ascii = (index: number, text: string) =>
		[...text].every((char, offset) => at(index + offset) === char.charCodeAt(0));
	const sized = (width: number, height: number, end: number) =>
		bytes.length >= end && width > 0 && height > 0 ? { width, height } : undefined;
	const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
	if (extension === ".png" && ascii(12, "IHDR")) {
		return sized(((be16(16) << 16) | be16(18)) >>> 0, ((be16(20) << 16) | be16(22)) >>> 0, 24);
	}
	if (extension === ".gif" && ascii(0, "GIF8")) return sized(le16(6), le16(8), 10);
	if (extension === ".webp" && ascii(0, "RIFF") && ascii(8, "WEBP")) {
		if (ascii(12, "VP8 ")) return sized(le16(26) & 0x3fff, le16(28) & 0x3fff, 30);
		if (ascii(12, "VP8L")) {
			const bits = (at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24)) >>> 0;
			return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 25);
		}
		if (ascii(12, "VP8X")) return sized(le24(24) + 1, le24(27) + 1, 30);
		return undefined;
	}
	if ((extension === ".jpg" || extension === ".jpeg") && at(0) === 0xff && at(1) === 0xd8) {
		// each segment after the start: a marker, then its length; a frame header names the size
		for (let index = 2; index + 9 <= bytes.length; ) {
			if (at(index) !== 0xff) return undefined;
			const marker = at(index + 1);
			if (marker === 0xff) {
				index += 1;
				continue;
			}
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return sized(be16(index + 7), be16(index + 5), index + 9);
			}
			index += 2 + be16(index + 2);
		}
	}
	return undefined;
}

/** The longest side and the size past which an image is too big to serve as it is. */
const MAX_SIDE_PX = 4096;
const MAX_BYTES = 5_000_000;

/**
 * One line naming a frame's images too big to load as they are, and the fix,
 * or nothing when none is: an imported image is served untouched (#216), so a
 * camera original costs every canvas that shows the frame.
 */
export function oversizedImages(assets: readonly CompiledAsset[]): string | undefined {
	const named = assets.flatMap((asset) => {
		const wide = Math.max(asset.width ?? 0, asset.height ?? 0) > MAX_SIDE_PX;
		if (wide) return [`design/${asset.path} (${asset.width}×${asset.height} px)`];
		if (asset.size > MAX_BYTES) return [`design/${asset.path} (${Math.round(asset.size / 1_000_000)} MB)`];
		return [];
	});
	if (named.length === 0) return undefined;
	return `images served as they are, and too big for it: ${named.join(", ")}. Save each web-sized: about 2400 px on its longest side for a photo, never over 4096, and a few MB at most`;
}
