/**
 * What a project asset is (#101): which kinds a frame can import, how their
 * bytes are spelled once inlined, and what one document may carry. One list,
 * because the same six kinds are read by four independent readers — the
 * compiler's loader, the offline checker's module resolution, and both copies
 * of the capture allowlist — and a kind added to only some of them is a frame
 * that renders and a cover that does not.
 */

/** The asset kinds a frame can import, and the media type each rides as. */
export const ASSET_MEDIA_TYPES: Record<string, string> = {
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
};

export const ASSET_EXTENSIONS: ReadonlySet<string> = new Set(Object.keys(ASSET_MEDIA_TYPES));

/** Esbuild's plugin filter, and the checker's own read of the same list. */
export const ASSET_FILTER = /\.(?:gif|jpe?g|png|svg|webp)$/i;

/**
 * The media-type alternation the capture predicates allow, interpolated into
 * both embedded scripts so the allowlist cannot drift from the loader. The
 * escape is a regex one: the emitted source reads `svg\+xml`.
 */
export const CAPTURE_IMAGE_TYPES = "gif|jpeg|png|svg\\+xml|webp";

/**
 * How much inlined image one frame document may carry. A shipped document is
 * ~114 KB and #106 priced roughly 330 KB of extra document at about 60 ms, so
 * this lands near 100 ms against #107's 1 s arrival bar. Base64 costs a third
 * on top of the file, making this roughly 385 KB of real image. It is a
 * ceiling, not a target: a prototyping tool saying a photo is too big is
 * honest, and downscaling would need an image library with native binaries on
 * the npm-global install path.
 *
 * A frame document is what this guards, because the canvas loads a page full of
 * them at once. The player composition carries no image budget: it is one
 * document, loaded once, deliberately.
 */
export const IMAGE_BUDGET_BYTES = 512 * 1024;

/**
 * How much inlined local font one document may carry. Fonts keep a budget of
 * their own: a soft budget that degrades by leaving faces to the network cannot
 * be merged with a hard one that stops the build, and a face is finite in number
 * and byte-identical across frames in a way an image is not. A local face that
 * busts this fails the build rather than being silently dropped — unlike a
 * remote one it has nothing to fall back to, and text in a substituted typeface
 * with no explanation is the exact bug #80 was opened to kill.
 */
export const LOCAL_FONT_BUDGET_BYTES = 1024 * 1024;

/** How a budget names a size to the person who has to act on it. */
export function kilobytes(bytes: number): string {
	return `${Math.ceil(bytes / 1024)} KB`;
}
