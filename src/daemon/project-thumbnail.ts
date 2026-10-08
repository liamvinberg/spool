import {
	createSharedImageWatch,
	ImageRefused,
	imageRefusals,
	readFirstImage,
	removeSharedImage,
	type SharedImage,
	sharedImageFiles,
	writeSharedImage,
} from "./shared-image";
import { readCover, readCoverImage } from "./thumbs";

/**
 * A project's thumbnail: the picture its Home card shows, one hidden image at `design/shared/thumbnail.*`, found
 * the way the icon file is. It is no frame and never stands on the canvas. Without one, the card shows its
 * top-left frame's still (`summarizeProject`).
 *
 * Served at `/thumbnails/<project>/<hash>`, the hash its content, as the icon is.
 */
export type ProjectThumbnail = SharedImage;

/** `design/shared/thumbnail.<ext>`, for each kind in turn. */
export const THUMBNAIL_FILES = sharedImageFiles("thumbnail");

/** The largest thumbnail spool takes, written or found: a still of a tall frame is a few hundred kB. */
export const THUMBNAIL_MAX_BYTES = 8_000_000;

export const THUMBNAIL_REFUSALS = {
	...imageRefusals(THUMBNAIL_MAX_BYTES),
	still: "This frame has no picture yet. Try again once it has one.",
} as const;

export { ImageRefused as ThumbnailRefused };

/** The project's thumbnail and its bytes, or nothing when it has none. */
export async function readProjectThumbnail(
	root: string,
): Promise<{ thumbnail: ProjectThumbnail; bytes: Buffer } | undefined> {
	const found = await readFirstImage(root, THUMBNAIL_FILES, THUMBNAIL_MAX_BYTES);
	return found === undefined ? undefined : { thumbnail: found.image, bytes: found.bytes };
}

export async function findProjectThumbnail(root: string): Promise<ProjectThumbnail | undefined> {
	return (await readProjectThumbnail(root))?.thumbnail;
}

/**
 * "Set as thumbnail": the frame's still as it is now becomes `design/shared/thumbnail.<ext>`, in the still's own
 * format, and every other `thumbnail.*` goes. A snapshot: a later still of the frame changes nothing.
 */
export function setThumbnailFromFrame(root: string, frame: string): ProjectThumbnail {
	const cover = readCover(root, frame);
	const still = cover === undefined ? undefined : readCoverImage(root, frame, cover.hash);
	if (still === undefined) throw new ImageRefused(THUMBNAIL_REFUSALS.still);
	return writeSharedImage(root, "thumbnail", still.bytes, THUMBNAIL_MAX_BYTES);
}

/** "Remove thumbnail": `design/shared/thumbnail.*` goes, and the card shows its top-left frame again. */
export function removeProjectThumbnail(root: string): void {
	removeSharedImage(root, "thumbnail");
}

/** Tells the open pages when a project's thumbnail changes on disk, by whatever hand. */
export function createThumbnailWatch(deps: {
	subscribe: (root: string, listener: (event: { kind: string }) => void) => () => void;
	changed: (root: string, thumbnail: ProjectThumbnail | undefined) => void;
}) {
	return createSharedImageWatch({ find: findProjectThumbnail, ...deps });
}
