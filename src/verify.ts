import { readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeAtomic } from "./atomic-write";
import type { LogEntry } from "./daemon/booth";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./daemon/design-path";
import { readFrameGeometry } from "./daemon/projection";
import { type CaptureError, readCaptureError } from "./daemon/thumbs";
import { SpoolError } from "./errors";
import { frameSegment } from "./page-path";
import { refusalOf } from "./verbs";

/**
 * shot and logs (#25): two outputs of one headless scenario-seeded boot of the
 * really-served frame document in spool's own Chrome. The CLI runs your frame,
 * never reads the canvas — the boot is a fresh page, seeded like any first
 * open (named or default scenario). Compile errors surface
 * verbatim before a browser ever launches; the log cache under
 * design/.spool/verify is keyed to the document's closure etag and scenario,
 * so unchanged source in the same scenario replays without a boot.
 *
 * The boot itself is the daemon's: a page in the photo booth's browser
 * (`daemon/booth.ts`), through the same load and the same settle every cover
 * gets, ahead of any cover waiting. An agent's shot and the canvas's picture
 * of the same frame are one render, and the machine runs one browser for both.
 */

export interface BootDeps {
	daemonUrl: string;
	controlToken: string;
	root: string;
	name: string;
	frame: string;
	narrate: (line: string) => void;
	viewport?: { width: number; height: number };
	/** A fixed wait after the first commit, in place of the settle every cover gets. */
	at?: number;
	scenario?: string;
}

function controlHeaders(controlToken: string): HeadersInit {
	return { "X-Spool-Control": controlToken };
}

export type ShotOutcome =
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| { kind: "shot"; files: string[]; bootErrors: string[]; contentHeight: number };

export type LogsOutcome =
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| { kind: "logs"; entries: LogEntry[]; replayed: boolean; captureError?: CaptureError };

export async function shotFrame(deps: BootDeps): Promise<ShotOutcome> {
	const probe = await probeCompile(deps);
	if (probe.kind === "error") return { kind: "broken", message: probe.message };
	if (probe.kind === "missing") return probe;
	const boot = await bootFrame(deps);
	if (boot.kind !== "booted") return boot;
	return { kind: "shot", files: boot.files, bootErrors: boot.errors, contentHeight: boot.contentHeight };
}

export async function logsFrame(deps: BootDeps): Promise<LogsOutcome> {
	const probe = await probeCompile(deps);
	if (probe.kind === "error") return { kind: "broken", message: probe.message };
	if (probe.kind === "missing") return probe;
	const cached = readLogsCache(deps.root, deps.frame);
	// The frame's last cover failure (#173), read alongside its logs rather
	// than folded into either cache: a boot can replay while its cover keeps
	// failing, and the reason belongs on every answer this returns, not only a
	// fresh boot's.
	const captureError = readCaptureError(deps.root, deps.frame);
	if (cached !== undefined && cached.etag === probe.etag && cached.scenario === scenarioName(deps)) {
		return {
			kind: "logs",
			entries: cached.entries,
			replayed: true,
			...(captureError === undefined ? {} : { captureError }),
		};
	}
	const boot = await bootFrame(deps);
	if (boot.kind !== "booted") return boot;
	return {
		kind: "logs",
		entries: boot.entries,
		replayed: false,
		...(captureError === undefined ? {} : { captureError }),
	};
}

export function shotFile(root: string, frame: string): string {
	return verifyFile(root, frame, "png");
}

/** Slice n of a tiled shot, 1-based so the printed paths read top to bottom. */
export function shotTileFile(root: string, frame: string, tile: number): string {
	return verifyFile(root, frame, `${tile}.png`);
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
 * Retire every shot address this run did not write. The files are named
 * outputs an agent reads back by path, so a five-slice shot followed by a
 * two-slice one must not leave slices three to five telling last week's truth.
 */
function sweepShotFiles(root: string, frame: string, kept: string[]): void {
	const dir = dirname(shotFile(root, frame));
	const keep = new Set(kept.map((file) => file.slice(dir.length + 1)));
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	const stem = frameSegment(frame);
	for (const name of names) {
		if (!name.startsWith(`${stem}.`) || keep.has(name)) continue;
		if (/^(\d+\.)?png$/.test(name.slice(stem.length + 1))) rmSync(join(dir, name), { force: true });
	}
}

function logsFile(root: string, frame: string): string {
	return verifyFile(root, frame, "logs.json");
}

function verifyFile(root: string, frame: string, extension: string): string {
	const designDir = realDesignDir(root);
	const file = `${frameSegment(frame)}.${extension}`;
	return resolveDesignPath(designDir, join(designDir, ".spool", "verify", file), `.spool/verify/${file}`);
}

type Probe = { kind: "ok"; etag: string } | { kind: "error"; message: string } | { kind: "missing"; message: string };

/** The daemon compiles (cache-hit cheap); shot and logs branch on its JSON. */
async function probeCompile(deps: BootDeps): Promise<Probe> {
	const url = `${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/verify/${encodeURIComponent(deps.frame)}`;
	const res = await fetch(url, { headers: controlHeaders(deps.controlToken) });
	if (res.status === 401 || res.status === 403) throw await refusalOf(res, url);
	const body: unknown =
		res.headers.get("content-type")?.includes("json") === true ? await res.json() : await res.text();
	if (typeof body === "object" && body !== null) {
		const { kind, etag, message } = body as { kind?: unknown; etag?: unknown; message?: unknown };
		if (kind === "ok" && typeof etag === "string") return { kind: "ok", etag };
		if (kind === "error" && typeof message === "string") return { kind: "error", message };
		if (kind === "missing" && typeof message === "string") return { kind: "missing", message };
	}
	// not a verify answer: an unknown project, an ambiguous name, an old daemon
	throw new SpoolError(typeof body === "string" && body !== "" ? body : `the daemon could not verify "${deps.frame}"`);
}

type Boot =
	| { kind: "booted"; files: string[]; entries: LogEntry[]; errors: string[]; contentHeight: number }
	| { kind: "broken"; message: string };

/** One boot as the daemon answers it, line by line: narration while it waits, then the outcome. */
export type BootLine =
	| { narrate: string }
	| { outcome: Boot | { kind: "missing"; message: string } | { kind: "failed"; message: string } };

async function bootFrame(deps: BootDeps): Promise<Boot | { kind: "missing"; message: string }> {
	const { w, h } = frameSize(deps);
	const plan = planShot(w, h);
	if (plan.tiles.length > 1) {
		deps.narrate(`"${deps.frame}" is ${h}px tall — shooting ${plan.tiles.length} slices, top to bottom`);
	}
	const url = `${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/boot/${encodeURIComponent(deps.frame)}`;
	const res = await fetch(url, {
		method: "POST",
		headers: { ...controlHeaders(deps.controlToken), "content-type": "application/json" },
		body: JSON.stringify({
			width: w,
			height: h,
			...(deps.at === undefined ? {} : { at: deps.at }),
			...(deps.scenario === undefined ? {} : { scenario: deps.scenario }),
		}),
	});
	if (res.status === 401 || res.status === 403) throw await refusalOf(res, url);
	if (!res.ok || res.body === null) {
		const text = await res.text();
		throw new SpoolError(text !== "" ? text : `the daemon could not boot "${deps.frame}"`);
	}
	for await (const line of bootLines(res.body)) {
		if ("narrate" in line) {
			deps.narrate(line.narrate);
			continue;
		}
		if (line.outcome.kind === "failed") throw new SpoolError(line.outcome.message);
		return line.outcome;
	}
	throw new SpoolError(`the daemon stopped answering while it booted "${deps.frame}"`);
}

/** The daemon's answer as the lines it is written in, each one JSON. */
async function* bootLines(body: ReadableStream<Uint8Array>): AsyncGenerator<BootLine> {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line !== "") yield JSON.parse(line) as BootLine;
			newline = buffer.indexOf("\n");
		}
	}
	if (buffer.trim() !== "") yield JSON.parse(buffer) as BootLine;
}

/**
 * What one boot leaves for an agent to read back by path: the shot, or its
 * slices top to bottom, and the console under the document's etag and
 * scenario. Written by the daemon, which ran the boot; every address this run
 * did not write retires with it.
 */
export function recordBoot(
	root: string,
	frame: string,
	boot: { etag: string; scenario: string; pngs: readonly Buffer[]; entries: readonly LogEntry[] },
): string[] {
	const files =
		boot.pngs.length === 1
			? [shotFile(root, frame)]
			: boot.pngs.map((_, index) => shotTileFile(root, frame, index + 1));
	for (const [index, file] of files.entries()) {
		const png = boot.pngs[index];
		if (png !== undefined) writeAtomic(file, png);
	}
	sweepShotFiles(root, frame, files);
	writeAtomic(
		logsFile(root, frame),
		`${JSON.stringify({ etag: boot.etag, scenario: boot.scenario, at: new Date().toISOString(), entries: boot.entries }, null, "\t")}\n`,
	);
	return files;
}

/** An explicit viewport, else the sidecar footprint, else the narrated default. */
function frameSize(deps: BootDeps): { w: number; h: number } {
	if (deps.viewport !== undefined) return { w: deps.viewport.width, h: deps.viewport.height };
	const geometry = readFrameGeometry(deps.root, deps.frame);
	if (!geometry.persisted) {
		deps.narrate(`no valid frame.json for "${deps.frame}" — using the ${geometry.w}×${geometry.h} default viewport`);
	}
	return { w: Math.round(geometry.w), h: Math.round(geometry.h) };
}

/** Machine-written cache: anything malformed reads as no cache. */
function readLogsCache(
	root: string,
	frame: string,
): { etag: string; scenario: string; entries: LogEntry[] } | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(logsFile(root, frame), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const { etag, scenario, entries } = parsed as { etag?: unknown; scenario?: unknown; entries?: unknown };
	if (typeof etag !== "string" || typeof scenario !== "string" || !Array.isArray(entries)) return undefined;
	const sound = entries.every(
		(entry): entry is LogEntry =>
			typeof entry === "object" &&
			entry !== null &&
			typeof (entry as LogEntry).type === "string" &&
			typeof (entry as LogEntry).text === "string",
	);
	return sound ? { etag, scenario, entries } : undefined;
}

function scenarioName(deps: BootDeps): string {
	return deps.scenario ?? "default";
}
