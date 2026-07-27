import { createHash } from "node:crypto";
import { type Dirent, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import type { Cover } from "../cover";
import { COVER_HEAL_RUNG, COVER_RUNGS, coverRungWidth } from "../cover";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

/**
 * The cover store under design/.spool (#8, #111): boot covers for unmounted
 * frames. Self-captures from the canvas persist here; the Playwright fallback
 * writes the same store. App-owned, gitignored, and deliberately invisible to
 * the change watcher — the store publishes its own writes on the hub.
 *
 * One folder per frame, one file per rung, named for the ladder's content hash
 * and the rung's own width in device pixels. The name is the manifest: a single
 * sweep of the store answers what every frame's cover is and what widths it
 * offers, without opening an image the daemon has no library to decode. The hash
 * is what makes a cover's URL immutable, so a warm reload fetches none of them.
 *
 * A bare `<frame>.jpg` is not a cover. The old store's address has no reader
 * (#111): a frame whose cover is not in ladder form shows its placeholder and
 * the healer regenerates it, which is the missing-cover path either way.
 *
 * A rung's format is whatever wrote it, read back from its magic bytes: jpeg is
 * what both capture paths produce, png is what a caller may still hand over.
 */

/** Encodings the store accepts, newest first — the read order too. */
const COVER_FORMATS = [
	{ ext: "jpg", type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
	{ ext: "png", type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
] as const;

type CoverExt = (typeof COVER_FORMATS)[number]["ext"];

const HASH_CHARS = 32;
const COVER_HASH = new RegExp(`^[0-9a-f]{${HASH_CHARS}}$`);
const RUNG_NAME = new RegExp(
	`^([0-9a-f]{${HASH_CHARS}})\\.([1-9][0-9]*)\\.(${COVER_FORMATS.map((f) => f.ext).join("|")})$`,
);

/** Whether a string is shaped like a cover's address at all — the route's first gate. */
export function isCoverHash(value: string): boolean {
	return COVER_HASH.test(value);
}

/** The store's own folder, holding one folder per covered frame. */
function coverStoreDir(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "thumbs"));
}

/** One frame's own folder in the store. Resolved, so an escaped entry is refused, not written through. */
function coverDir(root: string, frame: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "thumbs", frame));
}

/** A terminal frame's serialized screen (#42) — its still store, beside the covers. */
export function termScreenFile(root: string, frame: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "term", `${frame}.screen`));
}

/** Names in a directory, symlinks excluded: readdir never resolves one, so an escaped entry simply is not there. */
function listing(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

const filesIn = (dir: string): string[] =>
	listing(dir)
		.filter((e) => e.isFile())
		.map((e) => e.name);
const foldersIn = (dir: string): string[] =>
	listing(dir)
		.filter((e) => e.isDirectory())
		.map((e) => e.name);

/**
 * The ladder a frame's folder holds. A crash between writing a new ladder and
 * sweeping the old one can leave two: the longer ladder wins, and the greater
 * hash breaks a tie, so every reader picks the same one.
 */
function ladderOf(dir: string): Cover | undefined {
	const rungs = new Map<string, number[]>();
	for (const name of filesIn(dir)) {
		const [, hash, width] = RUNG_NAME.exec(name) ?? [];
		if (hash === undefined || width === undefined) continue;
		const widths = rungs.get(hash) ?? [];
		widths.push(Number(width));
		rungs.set(hash, widths);
	}
	let best: Cover | undefined;
	for (const [hash, widths] of rungs) {
		// length first, hash only to break an actual tie: readdir order must not
		// decide, or two readers of one store answer differently
		if (
			best !== undefined &&
			(widths.length < best.widths.length || (widths.length === best.widths.length && hash < best.hash))
		) {
			continue;
		}
		best = { hash, widths: [...new Set(widths)].sort((a, b) => b - a) };
	}
	return best;
}

/** Every frame's cover, from one sweep of the store. */
export function scanCovers(root: string): Map<string, Cover> {
	const dir = coverStoreDir(root);
	const covers = new Map<string, Cover>();
	for (const frame of foldersIn(dir)) {
		const cover = ladderOf(join(dir, frame));
		if (cover !== undefined) covers.set(frame, cover);
	}
	return covers;
}

/** One frame's cover — nothing when the store holds none in ladder form. */
export function readCover(root: string, frame: string): Cover | undefined {
	return ladderOf(coverDir(root, frame));
}

/**
 * When a frame's cover last changed — the home card's freshest-three order. The
 * folder's own mtime says it: writing a rung into it, or sweeping the ladder it
 * replaced, moves the directory.
 */
export function coverModified(root: string, frame: string): number | undefined {
	try {
		return statSync(coverDir(root, frame)).mtimeMs;
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}

export interface StoredRung {
	bytes: Buffer;
	type: string;
}

/** The one rung an address names, or nothing — the address is exact, never a search. */
export function readCoverRung(root: string, frame: string, hash: string, width: number): StoredRung | undefined {
	if (!isCoverHash(hash) || !Number.isSafeInteger(width) || width < 1) return undefined;
	const dir = coverDir(root, frame);
	for (const format of COVER_FORMATS) {
		let bytes: Buffer;
		try {
			bytes = readFileSync(join(dir, `${hash}.${width}.${format.ext}`));
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			continue;
		}
		return { bytes, type: format.type };
	}
	return undefined;
}

/** The encoding a rung's leading bytes claim — undefined for anything else. */
export function coverFormat(bytes: Buffer): { ext: CoverExt; type: string } | undefined {
	for (const format of COVER_FORMATS) {
		if (format.magic.every((byte, i) => bytes[i] === byte)) return { ext: format.ext, type: format.type };
	}
	return undefined;
}

/** One rung on its way into the store: its width in device pixels, and its bytes. */
export interface CoverRungWrite {
	width: number;
	bytes: Buffer;
}

/**
 * Write a frame's ladder and retire whatever stood there before — one cover per
 * frame, so no reader can be answered with a stale rung. Throws on bytes that
 * are not a cover this store knows how to serve.
 */
export function writeCover(root: string, frame: string, rungs: readonly CoverRungWrite[]): Cover {
	// The folder resolves before the bytes are looked at: a cover path that
	// escapes design/ is that fact whatever the payload turns out to be, and a
	// format complaint must never mask it.
	const dir = coverDir(root, frame);
	if (rungs.length === 0 || rungs.length > COVER_RUNGS) throw new UnservableCoverError();
	const ordered = [...rungs].sort((a, b) => b.width - a.width);
	const formats = ordered.map((rung) => {
		const format = coverFormat(rung.bytes);
		if (format === undefined) throw new UnservableCoverError();
		return format;
	});

	const digest = createHash("sha256");
	for (const rung of ordered) digest.update(`${rung.width}:`).update(rung.bytes);
	const hash = digest.digest("hex").slice(0, HASH_CHARS);

	const written = new Set<string>();
	for (const [index, rung] of ordered.entries()) {
		const name = `${hash}.${rung.width}.${formats[index]?.ext}`;
		written.add(name);
		writeAtomic(join(dir, name), rung.bytes);
	}
	for (const name of filesIn(dir)) {
		if (!written.has(name)) rmSync(join(dir, name), { force: true });
	}
	// the bare file the pre-ladder store wrote sits one level up, addressable by
	// nothing. Writing here is the moment it stops being anybody's cover.
	for (const format of COVER_FORMATS) {
		rmSync(join(coverStoreDir(root), `${frame}.${format.ext}`), { force: true });
	}
	return { hash, widths: ordered.map((rung) => rung.width) };
}

/** Bytes, or a rung count, this store cannot serve a cover from. */
export class UnservableCoverError extends Error {
	constructor() {
		super("a cover must be one to three rungs of PNG or JPEG image");
		this.name = "UnservableCoverError";
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
	stored(root: string, frame: string, cover: Cover): void;
}

const HEAL_COOLDOWN_MS = 60_000;

/**
 * The persistent fallback (#8): a missing cover enqueues one headless shot —
 * per-frame cooldown, one at a time — so covers heal one by one after the shot
 * lands, announced through `stored` (the hub). Misses while a browser is
 * unavailable cost one failed launch and then nothing.
 *
 * A heal writes the ladder's bottom rung and nothing else: the daemon carries
 * playwright-core and no image library, so it shoots at one device scale
 * (`shots.ts`) and cannot resample. The frame's own next self-capture writes the
 * rungs above it.
 */
export function createThumbHealer(deps: HealerDeps) {
	const attempted = new Map<string, number>();
	let tail: Promise<void> = Promise.resolve();

	/** Whether the frame already has a cover — an unreadable store counts as none. */
	function covered(root: string, frame: string): boolean {
		try {
			return readCover(root, frame) !== undefined;
		} catch {
			return false;
		}
	}

	function request(heal: HealRequest): void {
		const key = `${heal.root}\0${heal.frame}`;
		const last = attempted.get(key);
		const now = Date.now();
		if (last !== undefined && now - last < HEAL_COOLDOWN_MS) return;
		// A covered frame needs no fallback, whatever address was asked for. The
		// check is here rather than only after the shot because a shot is a browser
		// launch and a frame boot: spending one to throw it away would let a made-up
		// address cost real work.
		if (covered(heal.root, heal.frame)) return;
		attempted.set(key, now);
		tail = tail
			.then(async () => {
				const shot = await deps.capture(heal);
				if (shot === undefined) return;
				// Those seconds are long enough for the frame to have mounted and
				// photographed itself, and a whole ladder must not lose to this one
				// bottom rung — the frame has no reason to photograph itself again.
				if (covered(heal.root, heal.frame)) return;
				const cover = writeCover(heal.root, heal.frame, [
					{ width: coverRungWidth(heal.width, heal.height, COVER_HEAL_RUNG), bytes: shot },
				]);
				deps.stored(heal.root, heal.frame, cover);
			})
			// one failed heal (full disk, dead browser) must not wedge the queue
			// or become an unhandled rejection; the cooldown already holds retry
			.catch(() => {});
	}

	return { request };
}
