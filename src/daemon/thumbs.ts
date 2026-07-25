import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

/**
 * The thumbnail cache under design/.spool (#8): boot covers for unmounted
 * frames. Self-captures from the canvas persist here; the Playwright fallback
 * writes the same store. App-owned, gitignored, and deliberately invisible to
 * the change watcher — the store publishes its own writes on the hub.
 *
 * A cover's format is whatever wrote it, read back from its magic bytes: jpeg
 * is what both capture paths produce now, png is the legacy store and stays
 * readable until the frame next covers itself.
 */

/** Covers the store accepts, newest encoding first — the read order too. */
const THUMB_FORMATS = [
	{ ext: "jpg", type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
	{ ext: "png", type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
] as const;

type ThumbExt = (typeof THUMB_FORMATS)[number]["ext"];

export function thumbFile(root: string, frame: string, ext: ThumbExt = "jpg"): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "thumbs", `${frame}.${ext}`));
}

/** The stored cover's path and media type, in whichever format wrote it. */
export function findThumb(root: string, frame: string): { file: string; type: string } | undefined {
	for (const format of THUMB_FORMATS) {
		const file = thumbFile(root, frame, format.ext);
		if (existsSync(file)) return { file, type: format.type };
	}
	return undefined;
}

/** Whether a frame has a cover at all, in any stored format. */
export function hasThumb(root: string, frame: string): boolean {
	return findThumb(root, frame) !== undefined;
}

/** When the stored cover was last written — undefined when there is none. */
export function thumbModified(root: string, frame: string): number | undefined {
	const found = findThumb(root, frame);
	if (found === undefined) return undefined;
	try {
		return statSync(found.file).mtimeMs;
	} catch {
		return undefined;
	}
}

/** A terminal frame's serialized screen (#42) — its still store, beside the thumbs. */
export function termScreenFile(root: string, frame: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "term", `${frame}.screen`));
}

export interface StoredThumb {
	bytes: Buffer;
	type: string;
	etag: string;
}

export function readThumb(root: string, frame: string): StoredThumb | undefined {
	const found = findThumb(root, frame);
	if (found === undefined) return undefined;
	let bytes: Buffer;
	try {
		bytes = readFileSync(found.file);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	return {
		bytes,
		type: found.type,
		etag: `"thumb-${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`,
	};
}

/** The encoding a cover's leading bytes claim — undefined for anything else. */
export function thumbFormat(bytes: Buffer): { ext: ThumbExt; type: string } | undefined {
	for (const format of THUMB_FORMATS) {
		if (format.magic.every((byte, i) => bytes[i] === byte)) return { ext: format.ext, type: format.type };
	}
	return undefined;
}

/** Throws on bytes that are not a cover this store knows how to serve. */
export function writeThumb(root: string, frame: string, bytes: Buffer): void {
	// Every candidate path resolves before the bytes are looked at: a cover
	// path that escapes design/ is that fact whatever the payload turns out to
	// be, and a format complaint must never mask it.
	const candidates = THUMB_FORMATS.map((format) => ({ ext: format.ext, file: thumbFile(root, frame, format.ext) }));
	const format = thumbFormat(bytes);
	if (format === undefined) throw new UnknownThumbFormatError();
	for (const candidate of candidates) {
		// one cover per frame: writing this encoding retires the other, or
		// `findThumb` would keep answering with the stale file
		if (candidate.ext === format.ext) writeAtomic(candidate.file, bytes);
		else rmSync(candidate.file, { force: true });
	}
}

export class UnknownThumbFormatError extends Error {
	constructor() {
		super("a cover must be a PNG or JPEG image");
		this.name = "UnknownThumbFormatError";
	}
}

export interface HealRequest {
	root: string;
	frame: string;
	url: string;
	width: number;
	height: number;
}

interface HealerDeps {
	capture(target: { url: string; width: number; height: number }): Promise<Buffer | undefined>;
	stored(root: string, frame: string): void;
}

const HEAL_COOLDOWN_MS = 60_000;

/**
 * The persistent fallback (#8): a thumbnail miss enqueues one headless shot —
 * single file, per-frame cooldown — so covers heal one by one after the shot
 * lands, announced through `stored` (the hub). Misses while a browser is
 * unavailable cost one failed launch and then nothing.
 */
export function createThumbHealer(deps: HealerDeps) {
	const attempted = new Map<string, number>();
	let tail: Promise<void> = Promise.resolve();

	function request(heal: HealRequest): void {
		const key = `${heal.root}\0${heal.frame}`;
		const last = attempted.get(key);
		const now = Date.now();
		if (last !== undefined && now - last < HEAL_COOLDOWN_MS) return;
		attempted.set(key, now);
		tail = tail
			.then(async () => {
				const png = await deps.capture(heal);
				if (png === undefined) return;
				writeThumb(heal.root, heal.frame, png);
				deps.stored(heal.root, heal.frame);
			})
			// one failed heal (full disk, dead browser) must not wedge the queue
			// or become an unhandled rejection; the cooldown already holds retry
			.catch(() => {});
	}

	return { request };
}
