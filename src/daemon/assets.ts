/**
 * What a project asset is (#101, #216): which kinds a frame can import and the
 * URL each is served at. The whole answer lives here, because the image and
 * font kinds are read by independent readers — the compiler's loader, the offline
 * checker's module resolution, the daemon's asset route, and both copies of the
 * capture allowlist — and a kind added to only some of them is a frame that
 * renders and a cover that does not.
 */

/**
 * The asset kinds a frame can import, and the media type each rides as. Fonts
 * came with references (spool#241), whose @font-face rules point at the files
 * a site served them as.
 */
export const ASSET_MEDIA_TYPES: Record<string, string> = {
	".avif": "image/avif",
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
	".otf": "font/otf",
};

export const ASSET_EXTENSIONS: ReadonlySet<string> = new Set(Object.keys(ASSET_MEDIA_TYPES));

/** The extensions above, as one regex alternation. */
export const ASSET_KINDS = "avif|gif|jpe?g|png|svg|webp|woff2?|ttf|otf";

/** Esbuild's plugin filter, and the checker's own read of the same list. */
export const ASSET_FILTER = new RegExp(`\\.(?:${ASSET_KINDS})$`, "i");

/** Text assets arrive as source strings in the compiler and offline checker. */
export const TEXT_LOADERS = {
	".txt": "text",
	".glsl": "text",
	".wgsl": "text",
	// a reference's page (spool#241): the site's markup and styles, which its frame hands an iframe
	".html": "text",
} as const;
export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set(Object.keys(TEXT_LOADERS));

/**
 * The media-type alternation the capture predicates allow, interpolated into
 * both embedded scripts so the allowlist cannot drift from the loader. The
 * escape is a regex one: the emitted source reads `svg\+xml`.
 */
export const CAPTURE_IMAGE_TYPES = "gif|jpeg|png|svg\\+xml|webp";

/**
 * Where a frame finds an imported image (#216): host-relative, so the daemon
 * and a Worker compile the same document, and named by the SHA-256 of its
 * bytes and its kind alone, so the answer at the address never changes.
 */
export function assetUrl(hash: string, file: string): string {
	return `/asset/${hash}${file.slice(file.lastIndexOf(".")).toLowerCase()}`;
}

/** An asset URL's path, its hash and extension captured. */
export const ASSET_PATH = new RegExp(`^/asset/([0-9a-f]{64})(\\.(?:${ASSET_KINDS}))$`);

/** Whether a URL, resolved against a document at `base`, is one of that document's own host's asset URLs. */
export function isAssetUrl(value: string, base: string): boolean {
	try {
		const url = new URL(value, base);
		return url.origin === new URL(base).origin && url.search === "" && ASSET_PATH.test(url.pathname);
	} catch {
		return false;
	}
}

/** Why an imported file is refused: more than a team project's file may be. */
export function assetTooLarge(file: string, bytes: number, limit: number): string {
	return `design/${file} is ${megabytes(bytes)}, over the ${megabytes(limit)} a project file may be: save it smaller`;
}

function megabytes(bytes: number): string {
	return `${Math.ceil(bytes / 1_000_000)} MB`;
}

/**
 * How much inlined local font one document may carry: fonts still ride the
 * document, because a face is finite in number and byte-identical across
 * frames in a way an image is not. A local face that busts this fails the build rather than being silently dropped — unlike a
 * remote one it has nothing to fall back to, and text in a substituted typeface
 * with no explanation is the exact bug #80 was opened to kill.
 */
export const LOCAL_FONT_BUDGET_BYTES = 1024 * 1024;

/** How a budget names a size to the person who has to act on it. */
export function kilobytes(bytes: number): string {
	return `${Math.ceil(bytes / 1024)} KB`;
}
