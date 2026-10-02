import { readFrameGeometry } from "./daemon/projection";
import { type CaptureError, readCaptureError } from "./daemon/thumbs";
import { type BootLine, type BootOutcome, type LogEntry, planShot, readLogsCache } from "./daemon/verify-record";
import { SpoolError } from "./errors";
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

type Boot = Exclude<BootOutcome, { kind: "failed" }>;

async function bootFrame(deps: BootDeps): Promise<Boot> {
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

/** An explicit viewport, else the sidecar footprint, else the narrated default. */
function frameSize(deps: BootDeps): { w: number; h: number } {
	if (deps.viewport !== undefined) return { w: deps.viewport.width, h: deps.viewport.height };
	const geometry = readFrameGeometry(deps.root, deps.frame);
	if (!geometry.persisted) {
		deps.narrate(`no valid frame.json for "${deps.frame}" — using the ${geometry.w}×${geometry.h} default viewport`);
	}
	return { w: Math.round(geometry.w), h: Math.round(geometry.h) };
}

function scenarioName(deps: BootDeps): string {
	return deps.scenario ?? "default";
}
