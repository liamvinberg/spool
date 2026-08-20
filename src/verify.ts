import { readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeAtomic } from "./atomic-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./daemon/design-path";
import { renderOrigin } from "./daemon/lifecycle";
import { projectedKind, readFrameGeometry } from "./daemon/projection";
import { type CaptureError, readCaptureError, termScreenFile } from "./daemon/thumbs";
import { SpoolError } from "./errors";
import { launchHeadlessShell } from "./headless-shell";
import { refusalOf } from "./verbs";

/**
 * shot and logs (#25): two outputs of one headless scenario-seeded boot of the
 * really-served frame document in spool's own Chrome. The CLI runs your frame,
 * never reads the canvas — the boot is a fresh page, seeded like any first
 * open (named or default scenario, mock installed). Compile errors surface
 * verbatim before a browser ever launches; the log cache under
 * design/.spool/verify is keyed to the document's closure etag and scenario,
 * so unchanged source in the same scenario replays without a boot.
 */

export interface BootDeps {
	daemonUrl: string;
	controlToken: string;
	root: string;
	name: string;
	frame: string;
	narrate: (line: string) => void;
	viewport?: { width: number; height: number };
	at?: number;
	scenario?: string;
	/** The post-commit clock seam. */
	wait?: (milliseconds: number) => Promise<void>;
}

const DEFAULT_SETTLE_MS = 300;

function controlHeaders(controlToken: string): HeadersInit {
	return { "X-Spool-Control": controlToken };
}

export interface LogEntry {
	type: string;
	text: string;
}

export type ShotOutcome =
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| { kind: "shot"; files: string[]; bootErrors: string[] };

export type LogsOutcome =
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| { kind: "logs"; entries: LogEntry[]; replayed: boolean; captureError?: CaptureError };

export async function shotFrame(deps: BootDeps): Promise<ShotOutcome> {
	if (await isTermFrame(deps)) return termShot(deps);
	const probe = await probeCompile(deps);
	if (probe.kind === "error") return { kind: "broken", message: probe.message };
	if (probe.kind === "missing") return probe;
	const boot = await bootFrame(deps, probe.etag);
	if (boot.kind === "broken") return boot;
	return { kind: "shot", files: boot.files, bootErrors: boot.errors };
}

export async function logsFrame(deps: BootDeps): Promise<LogsOutcome> {
	if (await isTermFrame(deps)) {
		return {
			kind: "broken",
			message: `"${deps.frame}" is a terminal frame — its output is its screen; use \`spool shot ${deps.frame}\``,
		};
	}
	const probe = await probeCompile(deps);
	if (probe.kind === "error") return { kind: "broken", message: probe.message };
	if (probe.kind === "missing") return probe;
	const cached = readLogsCache(deps.root, deps.frame);
	// The frame's last self-capture failure (#173), read alongside its logs
	// rather than folded into either cache: a boot can replay while a capture
	// keeps failing, and the reason belongs on every answer this returns, not
	// only a fresh boot's.
	const captureError = readCaptureError(deps.root, deps.frame);
	if (cached !== undefined && cached.etag === probe.etag && cached.scenario === scenarioName(deps)) {
		return {
			kind: "logs",
			entries: cached.entries,
			replayed: true,
			...(captureError === undefined ? {} : { captureError }),
		};
	}
	const boot = await bootFrame(deps, probe.etag);
	if (boot.kind === "broken") return boot;
	return {
		kind: "logs",
		entries: boot.entries,
		replayed: false,
		...(captureError === undefined ? {} : { captureError }),
	};
}

/**
 * A terminal frame's shot (#42) needs no browser: the daemon rasterizes the
 * screen grid in the pinned font, so the artifact is the process's own truth.
 */
async function termShot(deps: BootDeps): Promise<ShotOutcome> {
	const url = `${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/thumbs/${encodeURIComponent(deps.frame)}`;
	const res = await fetch(url, { headers: controlHeaders(deps.controlToken) });
	// a refusal is not a broken frame: it throws, so the boundary can name a skew
	if (res.status === 401 || res.status === 403) throw await refusalOf(res, url);
	if (!res.ok) return { kind: "broken", message: await res.text() };
	const file = verifyFile(deps.root, deps.frame, "svg");
	writeAtomic(file, await res.text());
	return { kind: "shot", files: [file], bootErrors: [] };
}

async function isTermFrame(deps: BootDeps): Promise<boolean> {
	const kind = projectedKind(deps.root, deps.frame);
	if (kind !== "term") return false;
	// Resolve the persisted-screen boundary without asking the canvas projection,
	// which would materialize a missing geometry sidecar.
	termScreenFile(deps.root, deps.frame);
	return true;
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
	for (const name of names) {
		if (!name.startsWith(`${frame}.`) || keep.has(name)) continue;
		if (/^(\d+\.)?png$/.test(name.slice(frame.length + 1))) rmSync(join(dir, name), { force: true });
	}
}

function logsFile(root: string, frame: string): string {
	return verifyFile(root, frame, "logs.json");
}

function verifyFile(root: string, frame: string, extension: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(
		designDir,
		join(designDir, ".spool", "verify", `${frame}.${extension}`),
		`.spool/verify/${frame}.${extension}`,
	);
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
	| { kind: "booted"; files: string[]; entries: LogEntry[]; errors: string[] }
	| { kind: "broken"; message: string };

async function bootFrame(deps: BootDeps, etag: string): Promise<Boot> {
	const { w, h } = frameSize(deps);
	const plan = planShot(w, h);
	const browser = await launchHeadlessShell(deps.narrate);
	try {
		const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: plan.scale });
		const entries: LogEntry[] = [];
		const errors: string[] = [];
		page.on("console", (message) => entries.push({ type: message.type(), text: message.text() }));
		page.on("pageerror", (error) => {
			// uncaught in the frame: part of the log stream, and what makes a boot broken
			const text = String(error);
			errors.push(text);
			entries.push({ type: "pageerror", text });
		});

		const scenario = deps.scenario === undefined ? "" : `?scenario=${encodeURIComponent(deps.scenario)}`;
		const url = `${renderOrigin(deps.daemonUrl)}/p/${encodeURIComponent(deps.name)}/frames/${encodeURIComponent(deps.frame)}${scenario}`;
		const response = await page.goto(url, { timeout: 15_000, waitUntil: "domcontentloaded" });
		if (response !== null && response.status() >= 500) {
			// the source broke between probe and boot — re-probe for the verbatim text
			const reprobe = await probeCompile(deps);
			return {
				kind: "broken",
				message: reprobe.kind === "error" ? reprobe.message : `frame "${deps.frame}" failed to serve`,
			};
		}
		// frames are blank until React commits (#16); a frame that renders nothing
		// is legitimate, so a quiet timeout still shoots what is there
		await page
			.waitForFunction("(document.getElementById('root')?.childElementCount ?? 0) > 0", undefined, {
				timeout: 10_000,
			})
			.catch(() => {});
		await (deps.wait?.(deps.at ?? DEFAULT_SETTLE_MS) ?? page.waitForTimeout(deps.at ?? DEFAULT_SETTLE_MS));
		const files: string[] = [];
		if (plan.tiles.length === 1) {
			writeAtomic(shotFile(deps.root, deps.frame), await page.screenshot({ type: "png" }));
			files.push(shotFile(deps.root, deps.frame));
		} else {
			deps.narrate(`"${deps.frame}" is ${h}px tall — shooting ${plan.tiles.length} slices, top to bottom`);
			for (const [index, tile] of plan.tiles.entries()) {
				const png = await page.screenshot({
					type: "png",
					clip: { x: 0, y: tile.y, width: w, height: tile.height },
				});
				const file = shotTileFile(deps.root, deps.frame, index + 1);
				writeAtomic(file, png);
				files.push(file);
			}
		}
		sweepShotFiles(deps.root, deps.frame, files);
		writeAtomic(
			logsFile(deps.root, deps.frame),
			`${JSON.stringify({ etag, scenario: scenarioName(deps), at: new Date().toISOString(), entries }, null, "\t")}\n`,
		);
		return { kind: "booted", files, entries, errors };
	} finally {
		await browser.close();
	}
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
