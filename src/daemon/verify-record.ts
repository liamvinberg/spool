import { readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeAtomic } from "../atomic-write";
import type { ColorScheme } from "../cover";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

/**
 * What one boot of a frame for `spool shot` and `spool logs` (#25) leaves for
 * an agent to read back by path under design/.spool/verify: the shot, or its
 * slices top to bottom, and the console, cached under the document's etag, the
 * scenario and the colour scheme it was booted in. The daemon writes it, since
 * the boot is a page in its photo booth; the CLI reads it, and replays the
 * console without a boot while all three still match.
 */

export interface LogEntry {
	type: string;
	text: string;
}

/**
 * The longest fixed wait `--at` may ask for. A shot is a boot an agent is
 * waiting on, and the booth gives every boot a deadline of its own; a wait
 * longer than this is a wait for something a shot cannot show.
 */
export const SHOT_AT_MAX_MS = 30_000;

/** The most times one `--at` may list: each is a full set of slices from the one boot. */
export const SHOT_AT_MAX_COUNT = 20;

/** One file of a shot: which slice of the frame it holds, in CSS px, and when it was taken. */
export interface ShotFile {
	file: string;
	/** The slice's top and height in CSS px; the whole frame when it fits one image. */
	y: number;
	height: number;
	/** Milliseconds after the first commit, when `--at` asked for a time. */
	at?: number;
}

/** What one boot came to. */
export type BootOutcome =
	| {
			kind: "booted";
			files: ShotFile[];
			/** PNG px per CSS px (`planShot`). */
			scale: number;
			entries: LogEntry[];
			errors: string[];
			contentHeight: number;
	  }
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| { kind: "failed"; message: string };

/**
 * One boot as the daemon answers it, line by line: a beat every few seconds so
 * the CLI can tell a daemon still working from one that went away, narration
 * while it waits on something an agent should hear about, then the outcome.
 */
export type BootLine = { beat: true } | { narrate: string } | { outcome: BootOutcome };

/**
 * Where a shot lands: the frame's own path under design/.spool/verify, so
 * `shop/checkout` is `verify/shop/checkout.png`. A time asked of `--at` names
 * its own file (`checkout@1500.png`), so a series never overwrites itself, and
 * a frame too tall for one image is numbered slices (`checkout.1.png`, …).
 */
export function shotFile(root: string, frame: string, options: { at?: number; tile?: number } = {}): string {
	const time = options.at === undefined ? "" : `@${options.at}`;
	const tile = options.tile === undefined ? "" : `.${options.tile}`;
	return verifyFile(root, frame, `${time}${tile}.png`);
}

/**
 * How a frame becomes images an agent can actually read. A shot exists
 * to be looked at by a vision model, and every model normalizes what it is
 * given down to a fixed budget — about 1.5 megapixels, longest edge around
 * 1600px — before looking. One screenshot of a long frame spends that whole
 * budget on height and hands back mush where the text was, so a frame much
 * taller than a screen is shot as a stack of slices instead, each one near the
 * budget on its own.
 */
/** Raster width a vision model keeps: capture wider and the downscale throws it away. */
const SHOT_TARGET_RASTER_W = 1600;
/** Raster height of one slice — a hair over the budget's long edge, never far past it. */
const SHOT_TILE_RASTER_H = 2000;
/** CSS px repeated across a cut, so no line of text is ever halved by one. */
const SHOT_TILE_OVERLAP = 48;
/** Headroom before slicing: one image up to 20% over budget beats two near-duplicates. */
const SHOT_SINGLE_TOLERANCE = 1.2;
/** Chromium renders the whole viewport as one surface, which caps out near 16384. */
const MAX_RASTER_EDGE = 16_000;

export interface ShotPlan {
	/** Device scale: 2× while that fits the budget, tapering instead of overshooting it. */
	scale: number;
	/** One full-height tile, or top-to-bottom slices with the last anchored to the bottom edge. */
	tiles: Array<{ y: number; height: number }>;
}

export function planShot(width: number, height: number): ShotPlan {
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const scale = Math.min(Math.min(2, Math.max(1, SHOT_TARGET_RASTER_W / w)), Math.max(0.25, MAX_RASTER_EDGE / h));
	const tileHeight = Math.round(SHOT_TILE_RASTER_H / scale);
	if (h <= tileHeight * SHOT_SINGLE_TOLERANCE) return { scale, tiles: [{ y: 0, height: h }] };
	const step = tileHeight - SHOT_TILE_OVERLAP;
	const count = Math.ceil((h - tileHeight) / step) + 1;
	const tiles = Array.from({ length: count }, (_, index) => ({
		y: Math.min(index * step, h - tileHeight),
		height: tileHeight,
	}));
	return { scale, tiles };
}

/**
 * Write what one boot left: the shot or its slices at each time, and the
 * console. Every file of the same times this run did not write retires with
 * it, because the files are named outputs an agent reads back by path, and a
 * five-slice shot followed by a two-slice one must not leave slices three to
 * five telling last week's truth. A shot at other times is another variant, and
 * stays.
 */
export function recordBoot(
	root: string,
	frame: string,
	boot: {
		etag: string;
		scenario: string;
		scheme: ColorScheme;
		tiles: ReadonlyArray<{ y: number; height: number }>;
		shots: ReadonlyArray<{ at?: number; pngs: readonly Buffer[] }>;
		entries: readonly LogEntry[];
	},
): ShotFile[] {
	const files: ShotFile[] = [];
	for (const shot of boot.shots) {
		const kept: string[] = [];
		for (const [index, png] of shot.pngs.entries()) {
			const at = shot.at === undefined ? {} : { at: shot.at };
			const file = shotFile(root, frame, { ...at, ...(shot.pngs.length === 1 ? {} : { tile: index + 1 }) });
			const tile = boot.tiles[index] ?? { y: 0, height: 0 };
			writeAtomic(file, png);
			kept.push(file);
			files.push({ file, y: tile.y, height: tile.height, ...at });
		}
		sweepShotFiles(root, frame, shot.at, kept);
	}
	sweepEncoded(root, frame);
	const { etag, scenario, scheme, entries } = boot;
	writeAtomic(
		logsFile(root, frame),
		`${JSON.stringify({ etag, scenario, scheme, at: new Date().toISOString(), entries }, null, "\t")}\n`,
	);
	return files;
}

/** Machine-written cache: anything malformed reads as no cache. */
export function readLogsCache(
	root: string,
	frame: string,
): { etag: string; scenario: string; scheme: string; entries: LogEntry[] } | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(logsFile(root, frame), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const { etag, scenario, scheme, entries } = parsed as {
		etag?: unknown;
		scenario?: unknown;
		scheme?: unknown;
		entries?: unknown;
	};
	if (typeof etag !== "string" || typeof scenario !== "string" || !Array.isArray(entries)) return undefined;
	const sound = entries.every(
		(entry): entry is LogEntry =>
			typeof entry === "object" &&
			entry !== null &&
			typeof (entry as LogEntry).type === "string" &&
			typeof (entry as LogEntry).text === "string",
	);
	// a cache from before the scheme was part of its name names none, and replays nothing
	return sound ? { etag, scenario, scheme: typeof scheme === "string" ? scheme : "", entries } : undefined;
}

function sweepShotFiles(root: string, frame: string, at: number | undefined, kept: string[]): void {
	const plain = shotFile(root, frame, at === undefined ? {} : { at });
	const dir = dirname(plain);
	const keep = new Set(kept.map((file) => file.slice(dir.length + 1)));
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	const stem = plain.slice(dir.length + 1, -".png".length);
	for (const name of names) {
		if (!name.startsWith(`${stem}.`) || keep.has(name)) continue;
		if (/^(\d+\.)?png$/.test(name.slice(stem.length + 1))) rmSync(join(dir, name), { force: true });
	}
}

/**
 * Shots and logs a frame on a page left under its old one-segment name
 * (`shop%2Fcheckout.png`), from before the names mirrored the frame's path:
 * they would otherwise sit beside the new ones looking current.
 */
function sweepEncoded(root: string, frame: string): void {
	if (!frame.includes("/")) return;
	const designDir = realDesignDir(root);
	const dir = join(designDir, ".spool", "verify");
	const stem = encodeURIComponent(frame);
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of names) {
		if (!name.startsWith(`${stem}.`)) continue;
		if (/^((\d+\.)?png|logs\.json)$/.test(name.slice(stem.length + 1))) rmSync(join(dir, name), { force: true });
	}
}

function logsFile(root: string, frame: string): string {
	return verifyFile(root, frame, ".logs.json");
}

function verifyFile(root: string, frame: string, suffix: string): string {
	const designDir = realDesignDir(root);
	const file = `${frame}${suffix}`;
	return resolveDesignPath(designDir, join(designDir, ".spool", "verify", file), `.spool/verify/${file}`);
}
