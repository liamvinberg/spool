import { readFrameGeometry } from "./daemon/projection";
import { type CaptureError, readCaptureError } from "./daemon/thumbs";
import { type BootLine, type BootOutcome, type LogEntry, readLogsCache, type ShotFile } from "./daemon/verify-record";
import { RefusedError, SpoolError } from "./errors";
import { refusalOf } from "./verbs";

/**
 * shot and logs (#25): two outputs of one headless scenario-seeded boot of the
 * really-served frame document in spool's own Chrome. The CLI runs your frame,
 * never reads the canvas — the boot is a fresh page, seeded like any first
 * open (named or default scenario). Compile errors surface
 * verbatim before a browser ever launches; the log cache under
 * design/.spool/verify is keyed to the document's closure etag, the scenario
 * and the colour scheme, so unchanged source in the same scenario and scheme
 * replays without a boot.
 *
 * The boot itself is the daemon's: a page in the photo booth's browser
 * (`daemon/booth.ts`), through the same load and the same settle every cover
 * gets, in the colour scheme the canvas shows, ahead of any cover waiting. An
 * agent's shot and the canvas's picture of the same frame are one render, and
 * the machine runs one browser for both.
 */

export interface BootDeps {
	daemonUrl: string;
	controlToken: string;
	root: string;
	name: string;
	frame: string;
	narrate: (line: string) => void;
	viewport?: { width: number; height: number };
	/** Fixed times after the first commit, in place of the settle every cover gets: one set of files each. */
	at?: number[];
	scenario?: string;
	/** How long the daemon may say nothing at all before the CLI stops waiting; a seam for tests. */
	quietMs?: number;
}

/**
 * How long a boot's answer may go without a single line. The daemon beats
 * every few seconds while it works, through a fetch of the browser included,
 * so this much silence is a daemon that went away, never one still busy.
 */
const BOOT_QUIET_MS = 30_000;

function controlHeaders(controlToken: string): HeadersInit {
	return { "X-Spool-Control": controlToken };
}

export type ShotOutcome =
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| {
			kind: "shot";
			files: ShotFile[];
			/** PNG px per CSS px. */
			scale: number;
			/** The CSS viewport the frame was shot at, and where it came from. */
			width: number;
			height: number;
			sizedBy: FrameSize["by"];
			/** Uncaught throws: a frame with any is a failed shot. */
			bootErrors: string[];
			/** Every console error and uncaught throw of the boot, as `[type] text` lines the way logs prints them. */
			consoleErrors: string[];
			contentHeight: number;
	  };

export type LogsOutcome =
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| { kind: "logs"; entries: LogEntry[]; replayed: boolean; captureError?: CaptureError };

export async function shotFrame(deps: BootDeps): Promise<ShotOutcome> {
	const probe = await probeCompile(deps);
	if (probe.kind === "error") return { kind: "broken", message: probe.message };
	if (probe.kind === "missing") return probe;
	const size = frameSize(deps);
	const boot = await bootFrame(deps, size);
	if (boot.kind !== "booted") return boot;
	return {
		kind: "shot",
		files: boot.files,
		scale: boot.scale,
		width: size.w,
		height: size.h,
		sizedBy: size.by,
		bootErrors: boot.errors,
		consoleErrors: boot.entries
			.filter((entry) => entry.type === "error" || entry.type === "pageerror")
			.map((entry) => `[${entry.type}] ${entry.text}`),
		contentHeight: boot.contentHeight,
	};
}

/** One frame of a batched shot: its outcome, or why the CLI could not get one. */
export interface BatchShot {
	frame: string;
	outcome: ShotOutcome | { kind: "failed"; message: string };
}

/**
 * `spool shot a b c` (#360): every frame asked of the daemon at once, so the
 * photo booth's tabs share them the way they share covers, and answered in the
 * order they were named as each is ready. One frame's failure is that frame's
 * answer, never the batch's. A line the daemon narrates for every frame alike,
 * the one-time browser fetch, is said once.
 */
export async function* shotFrames(deps: Omit<BootDeps, "frame">, frames: readonly string[]): AsyncGenerator<BatchShot> {
	const said = new Set<string>();
	const narrate = (line: string) => {
		if (said.has(line)) return;
		said.add(line);
		deps.narrate(line);
	};
	const pending = [...new Set(frames)].map(
		(frame): Promise<BatchShot> =>
			shotFrame({ ...deps, frame, narrate }).then(
				(outcome) => ({ frame, outcome }),
				(error: unknown) => {
					// a daemon that refuses the key refuses every frame alike: the
					// CLI's own boundary names the skew behind it (#155)
					if (error instanceof RefusedError) throw error;
					return {
						frame,
						outcome: { kind: "failed", message: error instanceof Error ? error.message : String(error) },
					};
				},
			),
	);
	// every frame is asked at once; one that is refused must not leave the rest unhandled
	for (const shot of pending) shot.catch(() => {});
	for (const shot of pending) yield await shot;
}

/** Why a batched frame's answer is one the batch exits 1 for, or nothing when it is not. */
export function batchShotFailure(shot: BatchShot): string | undefined {
	const { outcome } = shot;
	switch (outcome.kind) {
		case "shot":
			return outcome.bootErrors.length === 0 ? undefined : uncaught(outcome.bootErrors.length);
		case "broken":
			return "does not compile";
		case "missing":
			return "not found";
		case "failed":
			return "failed";
	}
}

function uncaught(count: number): string {
	return count === 1 ? "1 uncaught error" : `${count} uncaught errors`;
}

/** PNG px per CSS px, as short as it reads: 2, 1.111. */
function formatScale(scale: number): string {
	return String(Math.round(scale * 1000) / 1000);
}

/**
 * What one file holds, beside its path: the CSS px of the frame it shows (the
 * slice's y range on a tall frame) and the device scale, so stitching slices
 * or mapping a pixel back to the layout needs no guessing.
 */
function formatShotFile(file: ShotFile, outcome: Extract<ShotOutcome, { kind: "shot" }>): string {
	const scale = `scale ${formatScale(outcome.scale)}`;
	const whole = outcome.files.filter((each) => each.at === file.at).length === 1;
	const css = whole
		? `css ${outcome.width}x${file.height}`
		: `css y ${file.y}-${file.y + file.height} of ${outcome.height}`;
	return `${file.file}  ${css}, ${scale}`;
}

/**
 * One frame's block of a shot, one frame or many: a head line naming the frame
 * and how it went, then its files and its console errors, or the reason it has
 * none, indented under it. Everything an agent would have run `spool logs` for after
 * the shot is here, so the batch is the whole check.
 */
export function formatBatchShot(shot: BatchShot): string {
	const { frame, outcome } = shot;
	const indent = (text: string) =>
		text
			.split("\n")
			.map((line) => `  ${line}`)
			.join("\n");
	switch (outcome.kind) {
		case "shot": {
			const errors = outcome.consoleErrors.length;
			const said =
				errors === 0 ? "no console errors" : errors === 1 ? "1 console error" : `${errors} console errors`;
			const thrown = outcome.bootErrors.length === 0 ? "" : `, ${uncaught(outcome.bootErrors.length)}`;
			// the shot is cut to the height it was taken at: say when the content runs otherwise
			const height =
				outcome.contentHeight === outcome.height
					? `content ${outcome.contentHeight}px tall`
					: `${outcome.sizedBy} h ${outcome.height}, content ${outcome.contentHeight}`;
			const head = `${frame}: shot, ${height}, ${said}${thrown}`;
			return [head, ...outcome.files.map((file) => formatShotFile(file, outcome)), ...outcome.consoleErrors]
				.map((line, i) => (i === 0 ? line : indent(line)))
				.join("\n");
		}
		case "broken":
			return `${frame}: does not compile\n${indent(outcome.message)}`;
		case "missing":
			return `${frame}: not found\n${indent(outcome.message)}`;
		case "failed":
			return `${frame}: failed\n${indent(outcome.message)}`;
	}
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
	if (
		cached !== undefined &&
		cached.etag === probe.etag &&
		cached.scenario === scenarioName(deps) &&
		cached.scheme === probe.scheme
	) {
		return {
			kind: "logs",
			entries: cached.entries,
			replayed: true,
			...(captureError === undefined ? {} : { captureError }),
		};
	}
	const boot = await bootFrame(deps, frameSize(deps));
	if (boot.kind !== "booted") return boot;
	return {
		kind: "logs",
		entries: boot.entries,
		replayed: false,
		...(captureError === undefined ? {} : { captureError }),
	};
}

type Probe =
	| { kind: "ok"; etag: string; scheme: string }
	| { kind: "error"; message: string }
	| { kind: "missing"; message: string };

/** The daemon compiles (cache-hit cheap); shot and logs branch on its JSON. */
async function probeCompile(deps: BootDeps): Promise<Probe> {
	const url = `${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/verify/${encodeURIComponent(deps.frame)}`;
	const res = await fetch(url, { headers: controlHeaders(deps.controlToken) });
	if (res.status === 401 || res.status === 403) throw await refusalOf(res, url);
	const body: unknown =
		res.headers.get("content-type")?.includes("json") === true ? await res.json() : await res.text();
	if (typeof body === "object" && body !== null) {
		const { kind, etag, scheme, message } = body as {
			kind?: unknown;
			etag?: unknown;
			scheme?: unknown;
			message?: unknown;
		};
		if (kind === "ok" && typeof etag === "string") {
			return { kind: "ok", etag, scheme: typeof scheme === "string" ? scheme : "" };
		}
		if (kind === "error" && typeof message === "string") return { kind: "error", message };
		if (kind === "missing" && typeof message === "string") return { kind: "missing", message };
	}
	// not a verify answer: an unknown project, an ambiguous name, an old daemon
	throw new SpoolError(typeof body === "string" && body !== "" ? body : `the daemon could not verify "${deps.frame}"`);
}

type Boot = Exclude<BootOutcome, { kind: "failed" }>;

async function bootFrame(deps: BootDeps, { w, h }: FrameSize): Promise<Boot> {
	const url = `${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/boot/${encodeURIComponent(deps.frame)}`;
	const quietMs = deps.quietMs ?? BOOT_QUIET_MS;
	const stopped = new AbortController();
	const silence = () =>
		new SpoolError(
			`the daemon said nothing for ${Math.round(quietMs / 1000)} s while it booted "${deps.frame}" — \`spool status\` says whether it is still running`,
		);
	// the request itself is under the same bound as every line after it
	let quiet = setTimeout(() => stopped.abort(), quietMs);
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { ...controlHeaders(deps.controlToken), "content-type": "application/json" },
			body: JSON.stringify({
				width: w,
				height: h,
				...(deps.at === undefined ? {} : { at: deps.at }),
				...(deps.scenario === undefined ? {} : { scenario: deps.scenario }),
			}),
			signal: stopped.signal,
		});
		if (res.status === 401 || res.status === 403) throw await refusalOf(res, url);
		if (!res.ok || res.body === null) {
			const text = await res.text();
			throw new SpoolError(text !== "" ? text : `the daemon could not boot "${deps.frame}"`);
		}
		for await (const line of bootLines(res.body)) {
			clearTimeout(quiet);
			quiet = setTimeout(() => stopped.abort(), quietMs);
			if ("beat" in line) continue;
			if ("narrate" in line) {
				deps.narrate(line.narrate);
				continue;
			}
			if (line.outcome.kind === "failed") throw new SpoolError(line.outcome.message);
			return line.outcome;
		}
		throw new SpoolError(`the daemon stopped answering while it booted "${deps.frame}"`);
	} catch (error) {
		if (stopped.signal.aborted) throw silence();
		throw error;
	} finally {
		clearTimeout(quiet);
	}
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

interface FrameSize {
	w: number;
	h: number;
	/** Where the size came from, as the shot's head line names it. */
	by: "--viewport" | "frame.json" | "default";
}

/** An explicit viewport, else the sidecar footprint, else the narrated default. */
function frameSize(deps: BootDeps): FrameSize {
	if (deps.viewport !== undefined) return { w: deps.viewport.width, h: deps.viewport.height, by: "--viewport" };
	const geometry = readFrameGeometry(deps.root, deps.frame);
	if (!geometry.persisted) {
		deps.narrate(`no valid frame.json for "${deps.frame}" — using the ${geometry.w}×${geometry.h} default viewport`);
	}
	return { w: Math.round(geometry.w), h: Math.round(geometry.h), by: geometry.persisted ? "frame.json" : "default" };
}

function scenarioName(deps: BootDeps): string {
	return deps.scenario ?? "default";
}
