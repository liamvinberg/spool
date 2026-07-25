import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./atomic-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./daemon/design-path";
import { renderOrigin } from "./daemon/lifecycle";
import { SpoolError } from "./errors";
import { launchHeadlessShell } from "./headless-shell";

/**
 * shot and logs (#25): two outputs of one headless scenario-seeded boot of the
 * really-served frame document in spool's own Chrome. The CLI runs your frame,
 * never reads the canvas — the boot is a fresh page, seeded like any first
 * open (default scenario, mock installed). Compile errors surface verbatim
 * before a browser ever launches; the log cache under design/.spool/verify is
 * keyed to the document's closure etag, so unchanged source replays without a
 * boot and any edit refreshes.
 */

export interface BootDeps {
	daemonUrl: string;
	controlToken: string;
	root: string;
	name: string;
	frame: string;
	narrate: (line: string) => void;
}

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
	| { kind: "shot"; file: string; bootErrors: string[] };

export type LogsOutcome =
	| { kind: "broken"; message: string }
	| { kind: "missing"; message: string }
	| { kind: "logs"; entries: LogEntry[]; replayed: boolean };

export async function shotFrame(deps: BootDeps): Promise<ShotOutcome> {
	if (await isTermFrame(deps)) return termShot(deps);
	const probe = await probeCompile(deps);
	if (probe.kind === "error") return { kind: "broken", message: probe.message };
	if (probe.kind === "missing") return probe;
	const boot = await bootFrame(deps, probe.etag);
	if (boot.kind === "broken") return boot;
	return { kind: "shot", file: shotFile(deps.root, deps.frame), bootErrors: boot.errors };
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
	if (cached !== undefined && cached.etag === probe.etag) {
		return { kind: "logs", entries: cached.entries, replayed: true };
	}
	const boot = await bootFrame(deps, probe.etag);
	if (boot.kind === "broken") return boot;
	return { kind: "logs", entries: boot.entries, replayed: false };
}

/**
 * A terminal frame's shot (#42) needs no browser: the daemon rasterizes the
 * screen grid in the pinned font, so the artifact is the process's own truth.
 */
async function termShot(deps: BootDeps): Promise<ShotOutcome> {
	const url = `${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/thumbs/${encodeURIComponent(deps.frame)}`;
	const res = await fetch(url, { headers: controlHeaders(deps.controlToken) });
	if (!res.ok) return { kind: "broken", message: await res.text() };
	const file = verifyFile(deps.root, deps.frame, "svg");
	writeAtomic(file, await res.text());
	return { kind: "shot", file, bootErrors: [] };
}

async function isTermFrame(deps: BootDeps): Promise<boolean> {
	const res = await fetch(`${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/frames`, {
		headers: controlHeaders(deps.controlToken),
	});
	if (!res.ok) throw new SpoolError(await res.text());
	const projection = (await res.json()) as { frames?: { name: string; kind?: string }[] };
	return projection.frames?.find((entry) => entry.name === deps.frame)?.kind === "term";
}

export function shotFile(root: string, frame: string): string {
	return verifyFile(root, frame, "png");
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

type Boot = { kind: "booted"; entries: LogEntry[]; errors: string[] } | { kind: "broken"; message: string };

async function bootFrame(deps: BootDeps, etag: string): Promise<Boot> {
	const { w, h } = await frameSize(deps);
	const browser = await launchHeadlessShell(deps.narrate);
	try {
		const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
		const entries: LogEntry[] = [];
		const errors: string[] = [];
		page.on("console", (message) => entries.push({ type: message.type(), text: message.text() }));
		page.on("pageerror", (error) => {
			// uncaught in the frame: part of the log stream, and what makes a boot broken
			const text = String(error);
			errors.push(text);
			entries.push({ type: "pageerror", text });
		});

		const url = `${renderOrigin(deps.daemonUrl)}/p/${encodeURIComponent(deps.name)}/frames/${encodeURIComponent(deps.frame)}`;
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
		await page.waitForTimeout(300);
		const png = await page.screenshot({ type: "png" });

		writeAtomic(shotFile(deps.root, deps.frame), png);
		writeAtomic(
			logsFile(deps.root, deps.frame),
			`${JSON.stringify({ etag, at: new Date().toISOString(), entries }, null, "\t")}\n`,
		);
		return { kind: "booted", entries, errors };
	} finally {
		await browser.close();
	}
}

/** The frame's own footprint for the viewport: its sidecar, else the default. */
async function frameSize(deps: BootDeps): Promise<{ w: number; h: number }> {
	const res = await fetch(`${deps.daemonUrl}/api/p/${encodeURIComponent(deps.name)}/frames`, {
		headers: controlHeaders(deps.controlToken),
	});
	if (!res.ok) throw new SpoolError(await res.text());
	const projection = (await res.json()) as { frames?: { name: string; w: number; h: number }[] };
	const frame = projection.frames?.find((entry) => entry.name === deps.frame);
	if (frame !== undefined) return { w: Math.round(frame.w), h: Math.round(frame.h) };
	return { w: 390, h: 844 };
}

/** Machine-written cache: anything malformed reads as no cache. */
function readLogsCache(root: string, frame: string): { etag: string; entries: LogEntry[] } | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(logsFile(root, frame), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const { etag, entries } = parsed as { etag?: unknown; entries?: unknown };
	if (typeof etag !== "string" || !Array.isArray(entries)) return undefined;
	const sound = entries.every(
		(entry): entry is LogEntry =>
			typeof entry === "object" &&
			entry !== null &&
			typeof (entry as LogEntry).type === "string" &&
			typeof (entry as LogEntry).text === "string",
	);
	return sound ? { etag, entries } : undefined;
}
