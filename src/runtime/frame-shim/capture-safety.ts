import { CAPTURE_IMAGE_TYPES } from "../../daemon/assets";

/**
 * What a capture may carry, for both of its halves: the shim that sanitizes the
 * frame's clone, and the capture worker that refuses whatever got past it.
 * No external resource of any kind: only fragments and bounded data URLs of the
 * kinds a frame can import (#101) and the fonts the shim inlined itself.
 */

export const MAX_SOURCE_BYTES = 16 * 1024 * 1024;

const SAFE_FONT_DATA_URL = /^data:font\/(?:otf|ttf|woff2?);base64,[a-z0-9+/]+={0,2}$/i;
const SAFE_IMAGE_DATA_URL = new RegExp(`^data:image\\/(?:${CAPTURE_IMAGE_TYPES});base64,[a-z0-9+/]+={0,2}$`, "i");
export const SAFE_IMAGE_SRC_PREFIX: RegExp = new RegExp(`^data:image\\/(?:${CAPTURE_IMAGE_TYPES});base64,`, "i");

export const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
	"action",
	"background",
	"cite",
	"data",
	"formaction",
	"href",
	"poster",
	"src",
	"srcset",
	"xlink:href",
]);

export const FORBIDDEN_ELEMENTS: readonly string[] = [
	"audio",
	"base",
	"embed",
	"frame",
	"iframe",
	"link",
	"meta",
	"object",
	"script",
	"source",
	"track",
	"video",
];

function normalizeCaptureCss(value: string): string {
	return value
		.replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/\\([^\n\r\f])/g, "$1");
}

function hasUnsafeCaptureUrl(normalized: string): boolean {
	let unsafe = false;
	const remainder = normalized.replace(/url\s*\(\s*([^)]*)\)/gi, (_match, raw: string) => {
		let target = raw.trim();
		if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'"))) {
			target = target.slice(1, -1).trim();
		}
		const safeFragment = /^#[^\s"'()]+$/.test(target);
		const safeFont = target.length <= MAX_SOURCE_BYTES && SAFE_FONT_DATA_URL.test(target);
		// A project asset rides in the document as a bounded base64 image (#101),
		// so background-image and every other url() image reaches a still.
		const safeImage = target.length <= MAX_SOURCE_BYTES && SAFE_IMAGE_DATA_URL.test(target);
		if (!safeFragment && !safeFont && !safeImage) unsafe = true;
		return "";
	});
	return unsafe || /url\s*\(/i.test(remainder);
}

export function unsafeCaptureCss(value: string): boolean {
	const normalized = normalizeCaptureCss(value);
	return /@import/i.test(normalized) || hasUnsafeCaptureUrl(normalized);
}
