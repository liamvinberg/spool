import { createHash } from "node:crypto";
import { type Dirent, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import type { ColorScheme, Cover } from "../cover";
import { frameSegment, segmentFrame } from "../page-path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

const COVER_FORMATS = [
	{ ext: "jpg", type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
	{ ext: "png", type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
] as const;

type CoverExt = (typeof COVER_FORMATS)[number]["ext"];
const HASH_CHARS = 32;
const COVER_HASH = new RegExp(`^[0-9a-f]{${HASH_CHARS}}$`);
const COVER_NAME = new RegExp(`^([0-9a-f]{${HASH_CHARS}})\\.(${COVER_FORMATS.map((f) => f.ext).join("|")})$`);

export function isCoverHash(value: string): boolean {
	return COVER_HASH.test(value);
}

function coverStoreDir(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "thumbs"));
}

/** A frame's cover folder, keyed by its name, so a rename or a move has to carry it (#228, #336). */
export function coverDir(root: string, frame: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "thumbs", frameSegment(frame)));
}

/**
 * A frame's covers follow it to a new name (#228, #336). The geometry sidecar
 * rides inside the folder and needs nothing, but covers left under the old name
 * would blank the picture the canvas is drawing right now.
 */
export function carryCover(root: string, from: string, to: string): void {
	const held = coverDir(root, from);
	if (!existsSync(held)) return;
	const target = coverDir(root, to);
	// the new name was nobody's frame, so anything parked under it is orphaned cache
	rmSync(target, { recursive: true, force: true });
	renameSync(held, target);
}

function listing(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

const filesIn = (dir: string): string[] =>
	listing(dir)
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
/** Every frame the store holds a folder for, with that folder's name. */
const framesIn = (dir: string): { frame: string; folder: string }[] =>
	listing(dir)
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const frame = segmentFrame(entry.name);
			return frame === undefined ? [] : [{ frame, folder: entry.name }];
		});

/** A legacy ladder has no plain image name, and therefore no cover. */
function coverOf(dir: string): Cover | undefined {
	return coverAmong(filesIn(dir));
}

function coverAmong(names: string[]): Cover | undefined {
	const hashes = names
		.map((name) => COVER_NAME.exec(name)?.[1])
		.filter((hash): hash is string => hash !== undefined)
		.sort();
	const hash = hashes.at(-1);
	return hash === undefined ? undefined : { hash };
}

export function scanCovers(root: string): Map<string, Cover> {
	const covers = new Map<string, Cover>();
	const store = coverStoreDir(root);
	for (const { frame, folder } of framesIn(store)) {
		const cover = coverOf(join(store, folder));
		if (cover !== undefined) covers.set(frame, cover);
	}
	return covers;
}

/** One cover and the moment its folder last changed. */
export interface DatedCover {
	cover: Cover;
	shotAt: number;
}

/**
 * Every stored cover with its freshness, without holding the event loop. The
 * home list reads each registered project's whole store this way, so one walk
 * answers both what a frame's picture is and how recent it is — asking the
 * store for the picture and then stating each folder separately would resolve
 * the design boundary again per cover, and do all of it in a row.
 */
export async function scanDatedCovers(root: string): Promise<Map<string, DatedCover>> {
	const store = coverStoreDir(root);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (folder) => {
			const frame = segmentFrame(folder);
			if (frame === undefined) return undefined;
			const dir = join(store, folder);
			const cover = coverAmong((await listed(dir)).filter((entry) => entry.isFile()).map((entry) => entry.name));
			return cover === undefined ? undefined : { frame, cover, shotAt: (await modified(dir)) ?? 0 };
		}),
	);
	const covers = new Map<string, DatedCover>();
	for (const entry of scanned) {
		if (entry !== undefined) covers.set(entry.frame, { cover: entry.cover, shotAt: entry.shotAt });
	}
	return covers;
}

async function listed(dir: string): Promise<Dirent[]> {
	try {
		return await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

async function modified(dir: string): Promise<number | undefined> {
	try {
		return (await stat(dir)).mtimeMs;
	} catch {
		return undefined;
	}
}

export function readCover(root: string, frame: string): Cover | undefined {
	return coverOf(coverDir(root, frame));
}

export interface StoredCover {
	bytes: Buffer;
	type: string;
}

/** The one image an immutable cover address names. */
export function readCoverImage(root: string, frame: string, hash: string): StoredCover | undefined {
	if (!isCoverHash(hash)) return undefined;
	const dir = coverDir(root, frame);
	for (const format of COVER_FORMATS) {
		try {
			return { bytes: readFileSync(join(dir, `${hash}.${format.ext}`)), type: format.type };
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
		}
	}
	return undefined;
}

function coverFormat(bytes: Buffer): { ext: CoverExt; type: string } | undefined {
	return COVER_FORMATS.find((format) => format.magic.every((byte, index) => bytes[index] === byte));
}

/**
 * Write one image and retire every prior address for this frame.
 *
 * A cover whose frame follows the colour scheme says which one it was taken
 * in, beside it. The image stays content-addressed, and the scheme is the one
 * fact a canvas switching to the other can not read off the picture: which of
 * the covers it holds are now of a frame nobody is looking at.
 */
export function writeCover(root: string, frame: string, bytes: Buffer, scheme?: ColorScheme): Cover {
	const dir = coverDir(root, frame);
	const format = coverFormat(bytes);
	if (format === undefined) throw new Error("a cover must be one PNG or JPEG image");
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, HASH_CHARS);
	const name = `${hash}.${format.ext}`;
	writeAtomic(join(dir, name), bytes);
	// Every other file in the dir retires with the image it lost to, `error.json`
	// (#173) included: a landed cover is proof the reason it recorded no longer
	// applies, and nothing here treats that name specially.
	// A pace is of the source, not of the picture, and an edit times it again.
	for (const old of filesIn(dir)) {
		if (old !== name && old !== PACE_NAME) rmSync(join(dir, old), { force: true });
	}
	for (const legacyFormat of COVER_FORMATS) {
		rmSync(join(coverStoreDir(root), `${frame}.${legacyFormat.ext}`), { force: true });
	}
	if (scheme !== undefined) writeAtomic(join(dir, SCHEME_NAME), `${scheme}\n`);
	writeAtomic(join(dir, BOOTH_NAME), "");
	return { hash };
}

const SCHEME_NAME = "scheme";
/**
 * Beside every cover the booth made (ADR 0010). A cover without it was taken
 * by a canvas photographing its own frames, before the booth, and those
 * photographs came out blank for frames that draw with WebGL, animation
 * frames or dialogs, so they are owed again.
 */
const BOOTH_NAME = "booth";

/** Every frame whose stored cover the booth did not make, and has not failed to make again. */
export async function scanPreBoothCovers(root: string): Promise<string[]> {
	const store = coverStoreDir(root);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (folder) => {
			const frame = segmentFrame(folder);
			if (frame === undefined) return undefined;
			const names = (await listed(join(store, folder))).filter((entry) => entry.isFile()).map((entry) => entry.name);
			// a frame the booth failed on keeps its old cover and says why, and asking
			// again on every start would only fail again
			const owed =
				coverAmong(names) !== undefined && !names.includes(BOOTH_NAME) && !names.includes(CAPTURE_ERROR_NAME);
			return owed ? frame : undefined;
		}),
	);
	return scanned.filter((frame) => frame !== undefined);
}

/**
 * Every stored cover taken in a colour scheme its frame follows, with that
 * scheme. A frame that does not follow one has no entry: its picture is the
 * same in both. Read without holding the event loop, like `scanDatedCovers`:
 * a canvas changing scheme asks this of every registered project at once.
 */
export async function scanCoverSchemes(root: string): Promise<Map<string, ColorScheme>> {
	const store = coverStoreDir(root);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (folder) => {
			const frame = segmentFrame(folder);
			if (frame === undefined) return undefined;
			const scheme = await readFile(join(store, folder, SCHEME_NAME), "utf8").then(
				(text) => text.trim(),
				() => undefined,
			);
			return scheme === "light" || scheme === "dark" ? ([frame, scheme] as const) : undefined;
		}),
	);
	return new Map(scanned.filter((entry) => entry !== undefined));
}

const CAPTURE_ERROR_NAME = "error.json";

/** How fast a frame redrew when the booth last timed it (booth.ts), beside its cover. */
export interface FramePace {
	/** Display frames a second the frame let through while it ran. */
	perSecond: number;
	/** The longest gap between two of them, in milliseconds. */
	slowestMs: number;
	/** The pixel density it was timed at. */
	scale: number;
}

/**
 * Fewer display frames a second than this and a frame is slow: a 60 Hz display
 * shows 60, and below this one that is playing is visibly not keeping up, at
 * any refresh rate. While it plays it holds back the whole canvas it is on,
 * since every frame on a canvas draws on the one GPU.
 */
export const SLOW_PER_SECOND = 45;

const PACE_NAME = "pace.json";

/** Record a frame's pace, or forget the last one when it could not be timed again. */
export function writePace(root: string, frame: string, pace: FramePace | undefined): void {
	const file = join(coverDir(root, frame), PACE_NAME);
	if (pace === undefined) rmSync(file, { force: true });
	else writeAtomic(file, `${JSON.stringify(pace)}\n`);
}

/** Every timed frame's pace, and when it was timed. Machine-written: anything malformed reads as untimed. */
export function scanPaces(root: string): Map<string, FramePace & { timedAt: number }> {
	const paces = new Map<string, FramePace & { timedAt: number }>();
	const store = coverStoreDir(root);
	for (const { frame, folder } of framesIn(store)) {
		const file = join(store, folder, PACE_NAME);
		try {
			const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<FramePace>;
			const { perSecond, slowestMs, scale } = parsed;
			if (typeof perSecond !== "number" || typeof slowestMs !== "number" || typeof scale !== "number") continue;
			paces.set(frame, { perSecond, slowestMs, scale, timedAt: statSync(file).mtimeMs });
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
		}
	}
	return paces;
}

function captureErrorFile(root: string, frame: string): string {
	return join(coverDir(root, frame), CAPTURE_ERROR_NAME);
}

export interface CaptureError {
	error: string;
	/** ISO timestamp of the failed picture, not of the read. */
	at: string;
}

/**
 * The reason the photo booth could not make a cover, beside the old one it
 * leaves standing (#173): a compile error, a throw on boot, a frame too large
 * or too slow to draw. `writeCover`'s own cleanup — every file in the frame's cover dir that is not
 * the new image gets removed — retires this the moment a later capture lands,
 * so a stale reason never outlives the picture that made it moot.
 */
export function writeCaptureError(root: string, frame: string, error: string): void {
	writeAtomic(captureErrorFile(root, frame), `${JSON.stringify({ error, at: new Date().toISOString() })}\n`);
}

/** Machine-written cache: anything malformed reads as no recorded error (mirrors readLogsCache in verify-record.ts). */
export function readCaptureError(root: string, frame: string): CaptureError | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(captureErrorFile(root, frame), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const { error, at } = parsed as { error?: unknown; at?: unknown };
	return typeof error === "string" && typeof at === "string" ? { error, at } : undefined;
}

/**
 * The pixel size of a frame's stored cover, read off the image's own header.
 *
 * A cover is 800 px wide at whatever height the frame's aspect gives it, so its
 * size says what footprint it was taken at without anything remembering it: a
 * frame whose sidecar moved without changing size keeps its picture, and one
 * whose size changed while the daemon was not running still learns it is wrong.
 */
export async function coverSize(root: string, frame: string): Promise<{ width: number; height: number } | undefined> {
	const dir = coverDir(root, frame);
	const names = (await listed(dir)).filter((entry) => entry.isFile()).map((entry) => entry.name);
	const cover = coverAmong(names);
	const name = cover === undefined ? undefined : names.find((candidate) => candidate.startsWith(`${cover.hash}.`));
	if (name === undefined) return undefined;
	const bytes = await readFile(join(dir, name)).catch(() => undefined);
	return bytes === undefined ? undefined : imageSize(bytes);
}

/** A JPEG's frame header or a PNG's IHDR, whichever the bytes are. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
	const at = (index: number) => bytes[index] ?? 0;
	if (at(0) === 0x89 && at(1) === 0x50 && bytes.length >= 24) {
		const word = (index: number) =>
			((at(index) << 24) | (at(index + 1) << 16) | (at(index + 2) << 8) | at(index + 3)) >>> 0;
		return { width: word(16), height: word(20) };
	}
	if (at(0) !== 0xff || at(1) !== 0xd8) return undefined;
	for (let index = 2; index + 8 < bytes.length; ) {
		if (at(index) !== 0xff) return undefined;
		const marker = at(index + 1);
		// a start-of-frame marker of any coding, never DHT, JPG or DAC
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return { width: (at(index + 7) << 8) | at(index + 8), height: (at(index + 5) << 8) | at(index + 6) };
		}
		index += 2 + ((at(index + 2) << 8) | at(index + 3));
	}
	return undefined;
}
