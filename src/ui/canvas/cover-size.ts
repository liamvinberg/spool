/**
 * A cover's pixel size, read from the first bytes of its file.
 *
 * The picture layer keeps every frame's cover as a small square in a texture
 * array, so the decoded image no longer carries its own shape, and drawing it
 * the way `Thumbnail` does — contained at the top left of its frame, never
 * stretched — needs the width and height it was photographed at. The header
 * says so in a few dozen bytes, where decoding the whole image to learn it
 * would cost the very decode the small square exists to avoid.
 *
 * Covers are the PNG and JPEG files a capture writes (`readCoverImage` serves
 * no other kind), so these two are the whole of what is read.
 */

export interface PixelSize {
	width: number;
	height: number;
}

/** The size in a PNG or JPEG header, or undefined for anything else or anything cut short. */
export function coverSize(bytes: Uint8Array): PixelSize | undefined {
	return pngSize(bytes) ?? jpegSize(bytes);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The IHDR chunk is first by rule: width and height are the eight bytes after its type. */
function pngSize(bytes: Uint8Array): PixelSize | undefined {
	if (bytes.length < 24 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) return undefined;
	if (String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0) !== "IHDR") return undefined;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return sized(view.getUint32(16), view.getUint32(20));
}

/**
 * A JPEG names its size in its start-of-frame segment, after whatever tables
 * and metadata precede it, so the segments are walked by their lengths until
 * one of the SOF markers turns up.
 */
function jpegSize(bytes: Uint8Array): PixelSize | undefined {
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let at = 2;
	while (at + 4 <= bytes.length) {
		if (bytes[at] !== 0xff) return undefined;
		const marker = bytes[at + 1] ?? 0;
		// fill bytes before a marker, and the markers that carry no length
		if (marker === 0xff) {
			at += 1;
			continue;
		}
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			at += 2;
			continue;
		}
		// end of image, or the scan itself: no frame header came before it
		if (marker === 0xd9 || marker === 0xda) return undefined;
		const length = view.getUint16(at + 2);
		if (length < 2) return undefined;
		// SOF0..SOF15, less DHT (c4), JPG (c8) and DAC (cc), which share the range
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			if (at + 9 > bytes.length) return undefined;
			return sized(view.getUint16(at + 7), view.getUint16(at + 5));
		}
		at += 2 + length;
	}
	return undefined;
}

function sized(width: number, height: number): PixelSize | undefined {
	return width > 0 && height > 0 ? { width, height } : undefined;
}
