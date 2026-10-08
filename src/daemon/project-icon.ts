import {
	createSharedImageWatch,
	type ImageExt,
	ImageRefused,
	imageRefusals,
	imageType,
	isImageHash,
	readFirstImage,
	removeSharedImage,
	sharedImageFiles,
	sniffImage,
	writeSharedImage,
} from "./shared-image";

/**
 * A project's icon, found by name with no manifest: the first file found wins.
 *
 * 1. `design/shared/icon.*`, the one a person chose. It sits in shared/ because that is what a team project's
 *    sync sends, so a teammate's tab gets it for free, and a local project's git tracks it.
 * 2. The repo's own favicon, from a short list of the places frameworks keep one. The project root is the folder
 *    holding design/, so a project made in a codebase wears that codebase's icon until someone picks another.
 * 3. Nothing, and the UI draws the name's first letter.
 *
 * The hash is the file's content: it addresses the bytes at `/icons/<project>/<hash>`, where it is both the
 * credential an <img> cannot carry as a header and an immutable cache key.
 */
export interface ProjectIcon {
	from: "file" | "favicon";
	/** Relative to the project root, forward slashes. */
	path: string;
	hash: string;
}

/** `design/shared/icon.<ext>`, the chosen icon, for each kind in turn. */
export const ICON_FILES = sharedImageFiles("icon");

/**
 * Where a repo keeps its favicon, most likely first: a vector anywhere beats a bitmap, since the icon is drawn at
 * 16 to 24 pixels, and an .ico (often a 16px bitmap) comes last. Within each kind: Vite's and CRA's `public/`,
 * Next's app router (`app/` or `src/app/`), SvelteKit's `static/`, then the root.
 */
export const FAVICON_FILES = [
	"public/favicon.svg",
	"public/icon.svg",
	"app/icon.svg",
	"src/app/icon.svg",
	"static/favicon.svg",
	"favicon.svg",
	"public/favicon.png",
	"public/icon.png",
	"app/icon.png",
	"src/app/icon.png",
	"static/favicon.png",
	"public/favicon.ico",
	"app/favicon.ico",
	"src/app/favicon.ico",
	"static/favicon.ico",
	"favicon.ico",
];

/** The largest icon spool takes, written or found: an icon is drawn at 24 pixels. */
export const ICON_MAX_BYTES = 1_000_000;

export const isIconHash = isImageHash;

/** The content type an icon path is served as. */
export const iconType = imageType;

/** The kind of image some bytes are, read from the bytes rather than from what a request said they were. */
export const sniffIcon: (bytes: Buffer) => ImageExt | undefined = sniffImage;

export { ImageRefused as IconRefused };

/** What a refused icon is told, in the app's words. */
export const ICON_REFUSALS = imageRefusals(ICON_MAX_BYTES);

/** The candidates in order: the chosen file's, then the favicons. */
const CANDIDATES = [...ICON_FILES, ...FAVICON_FILES];

/** The project's icon and its bytes, or nothing when it has none. */
export async function readProjectIcon(root: string): Promise<{ icon: ProjectIcon; bytes: Buffer } | undefined> {
	const found = await readFirstImage(root, CANDIDATES, ICON_MAX_BYTES);
	if (found === undefined) return undefined;
	const from = (ICON_FILES as string[]).includes(found.image.path) ? "file" : "favicon";
	return { icon: { from, ...found.image }, bytes: found.bytes };
}

/** The project's icon, for its card: what Home and the tabs draw. */
export async function findProjectIcon(root: string): Promise<ProjectIcon | undefined> {
	return (await readProjectIcon(root))?.icon;
}

/**
 * Write the chosen icon as `design/shared/icon.<ext>`, the kind read from its bytes, and take away every other
 * `icon.*` so exactly one is there. Refuses what isn't an SVG, PNG, WebP or JPEG, and anything over the cap.
 */
export function writeProjectIcon(root: string, bytes: Buffer): ProjectIcon {
	return { from: "file", ...writeSharedImage(root, "icon", bytes, ICON_MAX_BYTES) };
}

/** Take away `design/shared/icon.*`: the favicon or the letter comes back. */
export function removeProjectIcon(root: string): void {
	removeSharedImage(root, "icon");
}

/**
 * Keeps the open pages told when a project's icon changes on disk: by the menu, by hand, by an agent, or arriving
 * from a teammate through sync.
 */
export function createIconWatch(deps: {
	subscribe: (root: string, listener: (event: { kind: string }) => void) => () => void;
	changed: (root: string, icon: ProjectIcon | undefined) => void;
}) {
	return createSharedImageWatch({ find: findProjectIcon, ...deps });
}
