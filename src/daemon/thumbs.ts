import { createHash } from "node:crypto";
import { type Dirent, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeAtomic } from "../atomic-write";
import type { ColorScheme, Cover } from "../cover";
import { frameSegment, segmentFrame } from "../page-path";
import type { Census } from "../runtime/frame-shim/census";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

const COVER_FORMATS = [
	{ ext: "jpg", type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
	{ ext: "png", type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
] as const;

type CoverExt = (typeof COVER_FORMATS)[number]["ext"];
const HASH_CHARS = 32;
const COVER_HASH = new RegExp(`^[0-9a-f]{${HASH_CHARS}}$`);
const COVER_NAME = new RegExp(`^([0-9a-f]{${HASH_CHARS}})\\.(${COVER_FORMATS.map((f) => f.ext).join("|")})$`);
/**
 * A slide's opening still beside its cover (spool#319): the same frame at the size a talk draws it, on the beat the
 * talk opens on, which presenting flies in place of the cover. It is of the version its cover is of, so it goes with
 * that cover, as every other file beside a cover does.
 */
const OPENING_PREFIX = "opening-";
const OPENING_NAME = new RegExp(
	`^${OPENING_PREFIX}([0-9a-f]{${HASH_CHARS}})\\.(${COVER_FORMATS.map((f) => f.ext).join("|")})$`,
);

/** A slide's still of one of its beats (spool#330), named by the beat, from 0, and its own content. */
const BEAT_NAME = new RegExp(
	`^beat([0-9]+)-([0-9a-f]{${HASH_CHARS}})\\.(${COVER_FORMATS.map((f) => f.ext).join("|")})$`,
);

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
	// the version a still is of names its frame, so under the new name it is of no version anyone knows
	rmSync(join(target, SOURCE_NAME), { force: true });
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
	const last = (pattern: RegExp) =>
		names
			.map((name) => pattern.exec(name)?.[1])
			.filter((hash): hash is string => hash !== undefined)
			.sort()
			.at(-1);
	const hash = last(COVER_NAME);
	if (hash === undefined) return undefined;
	const opening = last(OPENING_NAME);
	if (opening === undefined) return { hash };
	const beats = beatsAmong(names);
	return beats === undefined ? { hash, opening } : { hash, opening, beats };
}

/** The beat stills among a cover's files, one for every beat from the first, or none. */
function beatsAmong(names: string[]): string[] | undefined {
	const beats: string[] = [];
	for (const name of names) {
		const found = BEAT_NAME.exec(name);
		if (found?.[1] !== undefined && found[2] !== undefined) beats[Number(found[1])] = found[2];
	}
	if (beats.length === 0) return undefined;
	for (let beat = 0; beat < beats.length; beat++) if (beats[beat] === undefined) return undefined;
	return beats;
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

/** The same sweep, without holding the event loop: every folder read at once. */
export async function scanCoversAwaited(root: string): Promise<Map<string, Cover>> {
	const store = coverStoreDir(root);
	const found = await Promise.all(
		(await listed(store))
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const frame = segmentFrame(entry.name);
				if (frame === undefined) return undefined;
				const names = (await listed(join(store, entry.name))).filter((one) => one.isFile()).map((one) => one.name);
				const cover = coverAmong(names);
				return cover === undefined ? undefined : ([frame, cover] as const);
			}),
	);
	return new Map(found.filter((each) => each !== undefined));
}

/** One frame's cover, without holding the event loop: what a Home card reads for its picture. */
export async function readCoverAwaited(root: string, frame: string): Promise<Cover | undefined> {
	const dir = coverDir(root, frame);
	return coverAmong((await listed(dir)).filter((entry) => entry.isFile()).map((entry) => entry.name));
}

async function listed(dir: string): Promise<Dirent[]> {
	try {
		return await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

export function readCover(root: string, frame: string): Cover | undefined {
	return coverOf(coverDir(root, frame));
}

export interface StoredCover {
	bytes: Buffer;
	type: string;
}

/** The one image an immutable cover address names: a cover, or the opening still or a beat still beside one. */
export function readCoverImage(root: string, frame: string, hash: string): StoredCover | undefined {
	if (!isCoverHash(hash)) return undefined;
	const dir = coverDir(root, frame);
	const beat = filesIn(dir)
		.map((name) => BEAT_NAME.exec(name))
		.find((found) => found?.[2] === hash);
	const beatName = beat === undefined || beat === null ? [] : [`beat${beat[1]}-${hash}`];
	for (const name of [hash, `${OPENING_PREFIX}${hash}`, ...beatName]) {
		for (const format of COVER_FORMATS) {
			try {
				return { bytes: readFileSync(join(dir, `${name}.${format.ext}`)), type: format.type };
			} catch (error) {
				if (error instanceof DesignBoundaryError) throw error;
			}
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
export function writeCover(
	root: string,
	frame: string,
	bytes: Buffer,
	scheme?: ColorScheme,
	source?: string,
	words?: readonly string[],
): Cover {
	const dir = coverDir(root, frame);
	const format = coverFormat(bytes);
	if (format === undefined) throw new Error("a cover must be one PNG or JPEG image");
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, HASH_CHARS);
	const name = `${hash}.${format.ext}`;
	writeAtomic(join(dir, name), bytes);
	// Every other file in the dir retires with the image it lost to, a failure
	// from before failures named their spool (#173) included: the picture says
	// the frame draws. A spool's own failure stays: a cover is anyone's, and
	// another release's picture says nothing of whether this one runs the frame
	// (spool#321), so only that spool's booth clears it (`clearCaptureError`).
	// A pace is of the source, not of the picture, and an edit times it again.
	for (const old of filesIn(dir)) {
		if (old !== name && old !== PACE_NAME && spoolOfFailure(old) === undefined)
			rmSync(join(dir, old), { force: true });
	}
	for (const legacyFormat of COVER_FORMATS) {
		rmSync(join(coverStoreDir(root), `${frame}.${legacyFormat.ext}`), { force: true });
	}
	if (scheme !== undefined) writeAtomic(join(dir, SCHEME_NAME), `${scheme}\n`);
	if (source !== undefined) writeAtomic(join(dir, SOURCE_NAME), `${source}\n`);
	if (words !== undefined) writeAtomic(join(dir, WORDS_NAME), words.join("\n"));
	writeAtomic(join(dir, BOOTH_NAME), "");
	return { hash };
}

/**
 * A slide's opening still, beside the cover just written of the same version (spool#319), retiring the one before it,
 * with the stills of its beats taken with it, or none (spool#330). Nothing is written for a frame with no cover: an
 * opening still never stands without the cover it goes with.
 */
export function writeOpening(
	root: string,
	frame: string,
	bytes: Buffer,
	beats: readonly Buffer[] = [],
): Cover | undefined {
	const dir = coverDir(root, frame);
	const cover = coverOf(dir);
	if (cover === undefined) return undefined;
	const format = coverFormat(bytes);
	if (format === undefined) throw new Error("an opening still must be one PNG or JPEG image");
	const opening = createHash("sha256").update(bytes).digest("hex").slice(0, HASH_CHARS);
	const name = `${OPENING_PREFIX}${opening}.${format.ext}`;
	writeAtomic(join(dir, name), bytes);
	const stills = beats.map((still, beat) => {
		const format = coverFormat(still);
		if (format === undefined) throw new Error("a beat still must be one PNG or JPEG image");
		const hash = createHash("sha256").update(still).digest("hex").slice(0, HASH_CHARS);
		writeAtomic(join(dir, `beat${beat}-${hash}.${format.ext}`), still);
		return { hash, name: `beat${beat}-${hash}.${format.ext}` };
	});
	const kept = new Set([name, ...stills.map((still) => still.name)]);
	for (const old of filesIn(dir)) {
		if (!kept.has(old) && (OPENING_NAME.test(old) || BEAT_NAME.test(old))) rmSync(join(dir, old), { force: true });
	}
	return stills.length === 0
		? { hash: cover.hash, opening }
		: { hash: cover.hash, opening, beats: stills.map((still) => still.hash) };
}

/**
 * A slide's opening still, and its beat stills, let go as the slide is edited (spool#319): they are of the slide before
 * the edit, and a talk flies its cover until the booth has the new one, as before. The cover stays, as a card shows the
 * last picture it has. The cover it now stands alone as, when it had a still beside it.
 */
export function retireOpening(root: string, frame: string): Cover | undefined {
	const dir = coverDir(root, frame);
	const cover = coverOf(dir);
	if (cover?.opening === undefined) return undefined;
	for (const old of filesIn(dir)) {
		if (OPENING_NAME.test(old) || BEAT_NAME.test(old)) rmSync(join(dir, old), { force: true });
	}
	return { hash: cover.hash };
}

const SCHEME_NAME = "scheme";
/**
 * Beside a still the booth took, the version of the frame it is of
 * (`CompiledFrameDocument.source`): what a team project's cover is filed under
 * in the cloud, so a still can be sent later, by whichever start finds the
 * cloud without it. A still without one is of a version nobody can say.
 */
const SOURCE_NAME = "source";
const SOURCE_HASH = /^[0-9a-f]{64}$/;

/**
 * Beside a still the booth took, what the frame said in it, one phrase a line:
 * the frame finder answers by it when neither a frame's name nor its page does
 * (finder-wake, task 443). It retires and comes back with the picture, so it is
 * always of the version the still is of.
 */
const WORDS_NAME = "words";
/** the most of a frame's text kept, in characters: enough to remember a screen by, little enough to send every frame's */
const WORDS_MOST = 1500;

/** A frame's text as the finder keeps it: each line once, its spaces collapsed, up to `WORDS_MOST` characters. */
export function phrasesOf(text: string): string[] {
	const phrases = new Set<string>();
	let kept = 0;
	for (const line of text.split("\n")) {
		const phrase = line.replace(/\s+/g, " ").trim();
		if (phrase.length === 0 || phrases.has(phrase)) continue;
		if (kept + phrase.length > WORDS_MOST) break;
		phrases.add(phrase);
		kept += phrase.length;
	}
	return [...phrases];
}

/** What every frame with a still said in it, read without holding the event loop. */
export async function scanWords(root: string): Promise<Map<string, string[]>> {
	const store = coverStoreDir(root);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (folder) => {
			const frame = segmentFrame(folder);
			if (frame === undefined) return undefined;
			const text = await readFile(join(store, folder, WORDS_NAME), "utf8").catch(() => undefined);
			return text === undefined || text === "" ? undefined : ([frame, text.split("\n")] as const);
		}),
	);
	return new Map(scanned.filter((entry) => entry !== undefined));
}

/** A frame's stored still, as a later send reads it: its address, the version it is of, and whether the booth failed on it since. */
export interface StoredStill {
	hash: string;
	source: string | undefined;
	failed: boolean;
}

/** What a cover the booth made was taken of: the version, and the scheme when its frame follows one. */
export function stillTaken(
	root: string,
	frame: string,
): { source: string; scheme: ColorScheme | undefined } | undefined {
	const dir = coverDir(root, frame);
	const read = (name: string) => {
		try {
			return readFileSync(join(dir, name), "utf8").trim();
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			return undefined;
		}
	};
	const source = read(SOURCE_NAME);
	if (read(BOOTH_NAME) === undefined || source === undefined || !SOURCE_HASH.test(source)) return undefined;
	const scheme = read(SCHEME_NAME);
	return { source, scheme: scheme === "light" || scheme === "dark" ? scheme : undefined };
}

/** Every frame's stored still, read without holding the event loop; `failed` is `spool`'s booth's. */
export async function scanStills(root: string, spool: string): Promise<Map<string, StoredStill>> {
	const store = coverStoreDir(root);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (folder) => {
			const frame = segmentFrame(folder);
			if (frame === undefined) return undefined;
			const names = (await listed(join(store, folder))).filter((entry) => entry.isFile()).map((entry) => entry.name);
			const cover = coverAmong(names);
			if (cover === undefined) return undefined;
			const recorded = names.includes(SOURCE_NAME)
				? await readFile(join(store, folder, SOURCE_NAME), "utf8").then(
						(text) => text.trim(),
						() => "",
					)
				: "";
			const still: StoredStill = {
				hash: cover.hash,
				source: SOURCE_HASH.test(recorded) ? recorded : undefined,
				failed: names.includes(failureName(spool)),
			};
			return [frame, still] as const;
		}),
	);
	return new Map(scanned.filter((entry) => entry !== undefined));
}
/**
 * Beside every cover the booth made (ADR 0010). A cover without it was taken
 * by a canvas photographing its own frames, before the booth, and those
 * photographs came out blank for frames that draw with WebGL, animation
 * frames or dialogs, so they are owed again.
 */
const BOOTH_NAME = "booth";

/**
 * Every frame whose stored cover the booth did not make, and every frame with a
 * failure from before failures named their spool, unless `spool`'s booth has
 * failed on it since.
 */
export async function scanPreBoothCovers(root: string, spool: string): Promise<string[]> {
	const store = coverStoreDir(root);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (folder) => {
			const frame = segmentFrame(folder);
			if (frame === undefined) return undefined;
			const names = (await listed(join(store, folder))).filter((entry) => entry.isFile()).map((entry) => entry.name);
			// a frame the booth failed on keeps its old cover and says why, and asking
			// again on every start would only fail again
			const own = failureName(spool);
			if (names.includes(own)) {
				const text = await readFile(join(store, folder, own), "utf8").catch(() => "");
				return parseCaptureError(text) === undefined ? frame : undefined;
			}
			// one from before failures named their spool is another release's verdict,
			// or one that can not say whose fault it was: this one gives its own
			if (names.includes(UNNAMED_FAILURE)) return frame;
			return coverAmong(names) !== undefined && !names.includes(BOOTH_NAME) ? frame : undefined;
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

/**
 * A failure as every spool wrote it before it said whose it was (spool#321),
 * and as releases from before then still write it.
 */
const UNNAMED_FAILURE = "error.json";
const FAILURE_NAME = /^error\.(.+)\.json$/u;

/**
 * Where a spool's booth records its failure, by the spool's version: every
 * release registered on a folder reads the same cover store, and a release
 * not restarted into its update fails slides a newer one runs (spool#321).
 */
function failureName(spool: string): string {
	return `error.${encodeURIComponent(spool)}.json`;
}

/** The spool a file in a cover folder is the failure of, or nothing for any other file. */
function spoolOfFailure(name: string): string | undefined {
	const named = FAILURE_NAME.exec(name)?.[1];
	if (named === undefined) return undefined;
	try {
		return decodeURIComponent(named);
	} catch {
		return undefined;
	}
}

/** What a frame was doing while it was timed (spool#318): the booth's census, and the two the frame's world counts. */
export interface FrameCensus extends Census {
	/** Canvases holding a WebGL context. */
	webgl: number;
	/** Whether the frame's own requestAnimationFrame callbacks kept running while nothing was asked of it. */
	loop: boolean;
}

/** How fast a slide redrew while one of its beats entered, from the beat before. */
export interface BeatPace {
	/** The beat, from 0. */
	beat: number;
	/** Its name, as the slide's `ui.beats` lists it. */
	name: string;
	perSecond: number;
	slowestMs: number;
	census?: FrameCensus | undefined;
}

/** How fast a frame redrew when the booth last timed it (booth.ts), beside its cover. */
export interface FramePace {
	/** Display frames a second the frame let through while it ran. */
	perSecond: number;
	/** The longest gap between two of them, in milliseconds. */
	slowestMs: number;
	/** The pixel density it was timed at. */
	scale: number;
	/** What it was doing at rest while it was timed. */
	census?: FrameCensus | undefined;
	/** A slide of a talk's beats after its first, each timed as it entered. */
	beats?: BeatPace[] | undefined;
}

/**
 * Fewer display frames a second than this and a frame is slow: a 60 Hz display
 * shows 60, and below this one that is playing is visibly not keeping up, at
 * any refresh rate. While it plays it holds back the whole canvas it is on,
 * since every frame on a canvas draws on the one GPU.
 */
export const SLOW_PER_SECOND = 45;

/** A recorded pace, and when the booth recorded it. */
export interface TimedPace extends FramePace {
	timedAt: number;
}

const PACE_NAME = "pace.json";

const DRAWN = z.object({ width: z.number(), height: z.number(), drawnWidth: z.number(), drawnHeight: z.number() });
const CENSUS = z.object({
	elements: z.number(),
	animations: z.array(z.object({ properties: z.array(z.string()), elements: z.number(), endless: z.boolean() })),
	canvasCount: z.number(),
	canvases: z.array(DRAWN),
	videos: z.number(),
	oversized: z.array(DRAWN.extend({ count: z.number() })),
	webgl: z.number(),
	loop: z.boolean(),
});
/** A pace file as the booth writes it; a census it cannot read is left out rather than the timing lost. */
const PACE_FILE = z.object({
	perSecond: z.number(),
	slowestMs: z.number(),
	scale: z.number(),
	census: CENSUS.optional().catch(undefined),
	beats: z
		.array(
			z.object({
				beat: z.number(),
				name: z.string(),
				perSecond: z.number(),
				slowestMs: z.number(),
				census: CENSUS.optional().catch(undefined),
			}),
		)
		.optional()
		.catch(undefined),
});

/** Record a frame's pace, or forget the last one when it could not be timed again. */
export function writePace(root: string, frame: string, pace: FramePace | undefined): void {
	const file = join(coverDir(root, frame), PACE_NAME);
	if (pace === undefined) rmSync(file, { force: true });
	else writeAtomic(file, `${JSON.stringify(pace)}\n`);
}

/**
 * Whether a frame drew with WebGL when the booth last timed it, at rest or as any of its beats entered: a slide the
 * booth takes beat stills of for the presenter's next pane (spool#330). Untimed, it is not known to.
 */
export function pacedWithWebgl(root: string, frame: string): boolean {
	try {
		const parsed = PACE_FILE.safeParse(JSON.parse(readFileSync(join(coverDir(root, frame), PACE_NAME), "utf8")));
		if (!parsed.success) return false;
		const { census, beats } = parsed.data;
		return (census?.webgl ?? 0) > 0 || (beats ?? []).some((beat) => (beat.census?.webgl ?? 0) > 0);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return false;
	}
}

/** Every timed frame's pace, and when it was timed. Machine-written: anything malformed reads as untimed. */
export function scanPaces(root: string): Map<string, TimedPace> {
	const paces = new Map<string, TimedPace>();
	const store = coverStoreDir(root);
	for (const { frame, folder } of framesIn(store)) {
		const file = join(store, folder, PACE_NAME);
		try {
			const parsed = PACE_FILE.safeParse(JSON.parse(readFileSync(file, "utf8")));
			if (!parsed.success) continue;
			paces.set(frame, { ...parsed.data, timedAt: statSync(file).mtimeMs });
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
		}
	}
	return paces;
}

function captureErrorFile(root: string, frame: string, spool: string): string {
	return join(coverDir(root, frame), failureName(spool));
}

/**
 * What kind of failure a recorded one is. `compile` and `boot` are the frame's
 * own fault: it does not build, or it throws as it starts, and the canvas shows
 * it broken. `capture` is the booth's: too large, too slow, or a page that would
 * not draw, and the frame may well work.
 */
export type CaptureFailure = "compile" | "boot" | "capture";

export interface CaptureError {
	error: string;
	/** ISO timestamp of the failed picture, not of the read. */
	at: string;
	kind: CaptureFailure;
}

/** A recorded failure that is the frame's own, as the canvas and `spool check` show it. */
export interface BrokenFrame {
	error: string;
	at: string;
	kind: Exclude<CaptureFailure, "capture">;
}

const CAPTURE_FAILURES: readonly CaptureFailure[] = ["compile", "boot", "capture"];

/**
 * The reason `spool`'s photo booth could not make a cover, beside the old one
 * it leaves standing (#173): a compile error, a throw on boot, a frame too large
 * or too slow to draw. It is that release's verdict alone: a cover is of the
 * frame whatever release took it, but whether a frame runs is its runtime's
 * (spool#321). The booth clears it the moment a later capture of its own lands
 * (`clearCaptureError`), so a stale reason never outlives the picture that made
 * it moot.
 */
export function writeCaptureError(
	root: string,
	frame: string,
	error: string,
	kind: CaptureFailure,
	spool: string,
): void {
	writeAtomic(
		captureErrorFile(root, frame, spool),
		`${JSON.stringify({ error, at: new Date().toISOString(), kind })}\n`,
	);
}

/** `spool`'s booth drew the frame: its recorded failure, if any, no longer applies. */
export function clearCaptureError(root: string, frame: string, spool: string): void {
	rmSync(captureErrorFile(root, frame, spool), { force: true });
}

/**
 * `spool`'s recorded failure. Machine-written cache: anything malformed reads as no recorded error (mirrors
 * readLogsCache in verify-record.ts).
 */
export function readCaptureError(root: string, frame: string, spool: string): CaptureError | undefined {
	try {
		return parseCaptureError(readFileSync(captureErrorFile(root, frame, spool), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}

/**
 * One recorded failure, or nothing when the text is no such record. One written
 * without its kind is nothing too: what it says can not be told apart as the
 * frame's or the booth's.
 */
function parseCaptureError(text: string): CaptureError | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const { error, at, kind } = parsed as { error?: unknown; at?: unknown; kind?: unknown };
	if (typeof error !== "string" || typeof at !== "string") return undefined;
	const known = CAPTURE_FAILURES.find((one) => one === kind);
	return known === undefined ? undefined : { error, at, kind: known };
}

/** Every frame whose last cover by `spool` failed through its own fault. */
export function scanBrokenFramesSync(root: string, spool: string): Map<string, BrokenFrame> {
	const broken = new Map<string, BrokenFrame>();
	const store = coverStoreDir(root);
	const own = failureName(spool);
	for (const { frame, folder } of framesIn(store)) {
		if (!filesIn(join(store, folder)).includes(own)) continue;
		let text = "";
		try {
			text = readFileSync(join(store, folder, own), "utf8");
		} catch {}
		const recorded = parseCaptureError(text);
		if (recorded !== undefined && recorded.kind !== "capture")
			broken.set(frame, { ...recorded, kind: recorded.kind });
	}
	return broken;
}

/** The same, read without holding the event loop. */
export async function scanBrokenFrames(root: string, spool: string): Promise<Map<string, BrokenFrame>> {
	const store = coverStoreDir(root);
	const own = failureName(spool);
	const folders = (await listed(store)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	const scanned = await Promise.all(
		folders.map(async (folder) => {
			const frame = segmentFrame(folder);
			if (frame === undefined) return undefined;
			const names = (await listed(join(store, folder))).filter((entry) => entry.isFile()).map((entry) => entry.name);
			if (!names.includes(own)) return undefined;
			const text = await readFile(join(store, folder, own), "utf8").catch(() => "");
			const recorded = parseCaptureError(text);
			if (recorded === undefined || recorded.kind === "capture") return undefined;
			return [frame, { error: recorded.error, at: recorded.at, kind: recorded.kind }] as const;
		}),
	);
	return new Map(scanned.filter((entry) => entry !== undefined));
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
