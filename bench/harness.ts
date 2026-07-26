import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The plumbing both benchmarks share: a private copy of a real spool project,
 * a daemon of its own, and the geometry reading that decides what to measure.
 *
 * Sharing it is not tidiness. `bench/canvas.ts` (#82) and `bench/frame-cost.ts`
 * (#85) quote numbers at each other — a per-frame cost against a per-frame
 * arrival — and two copies of "start a daemon" would eventually diverge in some
 * detail (a warmed compile cache, an update check, a leftover camera) that
 * silently makes those numbers incomparable.
 *
 * Run both with node's own type stripping, not tsx: in-page collectors are
 * serialized into the browser by playwright, and esbuild's keep-names transform
 * wraps every function in a `__name` helper that does not exist there.
 */

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A 14-inch MacBook Pro's default scaled window, in CSS pixels. */
export const VIEWPORT = { width: 1512, height: 945 };

/** A private copy of the project, so a run leaves the real canvas untouched. */
export function copyProject(source: string): { root: string; name: string; spoolDir: string } {
	const design = join(source, "design");
	if (!existsSync(join(design, "canvas.json"))) throw new Error(`${source} has no design/canvas.json`);
	const work = mkdtempSync(join(tmpdir(), "spool-bench-"));
	const root = join(work, basename(source));
	mkdirSync(root, { recursive: true });
	cpSync(design, join(root, "design"), { recursive: true });
	const spoolDir = join(work, "spool");
	mkdirSync(spoolDir, { recursive: true });
	// the update check would put a network fetch inside the measurement
	writeFileSync(join(spoolDir, "config.json"), `${JSON.stringify({ updateCheck: false })}\n`);
	return { root, name: basename(root), spoolDir };
}

export async function freePort(): Promise<number> {
	return await new Promise((done, fail) => {
		const probe = createServer();
		probe.once("error", fail);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (address === null || typeof address === "string") {
				probe.close();
				fail(new Error("could not reserve a port"));
				return;
			}
			const { port } = address;
			probe.close(() => done(port));
		});
	});
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
	return new Promise((done, fail) => {
		const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore" });
		child.once("error", fail);
		child.once("exit", (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
	});
}

export interface Daemon {
	/** The trusted origin: the canvas UI and the control API. */
	url: string;
	/** The untrusted virtual host every frame document is served from. */
	renderUrl: string;
	stop: () => void;
}

export async function startDaemon(spoolDir: string, root: string, port: number): Promise<Daemon> {
	const cli = join(repoRoot, "dist/cli.js");
	if (!existsSync(cli)) throw new Error(`${cli} is missing — run pnpm build first`);
	const env = { SPOOL_DIR: spoolDir, SPOOL_PORT: String(port) };
	await run(process.execPath, [cli, "open", root], env);
	const child = spawn(process.execPath, [cli, "serve", "--foreground"], { env: { ...process.env, ...env } });
	const url = `http://127.0.0.1:${port}`;
	// frames never share the canvas's origin (daemon/security.ts): they are
	// served from a virtual host with no access to the control capability, so a
	// harness that mounts them from 127.0.0.1 is not mounting what spool mounts
	const renderUrl = `http://run.spool.localhost:${port}`;
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${url}/p/${encodeURIComponent(basename(root))}`);
			if (response.ok) return { url, renderUrl, stop: () => child.kill() };
		} catch {
			// not listening yet
		}
		await new Promise((wait) => setTimeout(wait, 200));
	}
	child.kill();
	throw new Error(`daemon did not come up on ${url}`);
}

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A frame as the benchmarks need it: where it sits, how big it was authored. */
export interface FrameBox extends Box {
	name: string;
}

function readBox(file: string): Box | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
	const frame = parsed as Partial<Box> & { page?: unknown };
	// a named page is its own canvas with its own camera; one page at a time
	if (frame.page !== undefined) return undefined;
	if (typeof frame.x !== "number" || typeof frame.y !== "number") return undefined;
	if (typeof frame.w !== "number" || typeof frame.h !== "number") return undefined;
	return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
}

/**
 * The frames sharing one camera. Both layouts are read: `frames/<frame>/`
 * today, and `frames/<page>/<frame>/` after #89's hard cut, which would
 * otherwise leave this finding nothing and planning a camera over an empty
 * canvas. A page is the larger group under the page layout, since that is the
 * one canvas a single camera can put the most documents on screen at once.
 */
export function densestPage(root: string): FrameBox[] {
	const dir = join(root, "design", "frames");
	const flat: FrameBox[] = [];
	const pages = new Map<string, FrameBox[]>();
	for (const name of readdirSync(dir)) {
		const direct = readBox(join(dir, name, "frame.json"));
		if (direct !== undefined) {
			flat.push({ ...direct, name });
			continue;
		}
		let nested: string[];
		try {
			nested = readdirSync(join(dir, name));
		} catch {
			continue;
		}
		const boxes: FrameBox[] = [];
		for (const child of nested) {
			const box = readBox(join(dir, name, child, "frame.json"));
			if (box !== undefined) boxes.push({ ...box, name: `${name}/${child}` });
		}
		if (boxes.length > 0) pages.set(name, boxes);
	}
	if (flat.length > 0) return flat;
	let widest: FrameBox[] = [];
	for (const boxes of pages.values()) if (boxes.length > widest.length) widest = boxes;
	return widest;
}

/** Just above lifecycle's K_MIN_MOUNT of 0.15: the zoom that mounts the most. */
export const DEFAULT_ZOOM = 0.16;

export interface Camera {
	x: number;
	y: number;
	k: number;
}

/**
 * The camera a whole-canvas run starts from: the most frames this canvas can be
 * asked to mount at once. Below K_MIN_MOUNT a frame renders smaller than its own
 * still and the canvas mounts nothing at all, so the worst case sits just above
 * that threshold, centred on the densest band. Left to its own saved camera a
 * project opens wherever it was last dragged — four documents on matmannen,
 * which measures an idle canvas rather than the one the map is about.
 */
export function planCamera(boxes: Box[], width: number, height: number, k: number): Camera {
	const spanX = width / k;
	const spanY = height / k;
	let best: { y: number; count: number } | null = null;
	const centres = boxes.map((box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 }));
	for (const candidate of centres) {
		const count = centres.filter(
			(centre) => Math.abs(centre.y - candidate.y) <= spanY / 2 && Math.abs(centre.x - candidate.x) <= spanX / 2,
		).length;
		if (best === null || count > best.count) best = { y: candidate.y, count };
	}
	const midX = centres.reduce((sum, centre) => sum + centre.x, 0) / Math.max(1, centres.length);
	const midY = best?.y ?? 0;
	return { x: width / 2 - midX * k, y: height / 2 - midY * k, k };
}

/**
 * Rewrite the persisted camera before every run: the canvas saves its own on
 * settle, so a second run would otherwise open where the first one's gestures
 * left off rather than where the measurement was planned.
 */
export function writeCamera(root: string, camera: Camera): void {
	writeFileSync(
		join(root, "design", ".spool", "state.json"),
		`${JSON.stringify({ camera, arrows: true }, null, "\t")}\n`,
	);
}

export function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return Number.NaN;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
	return sorted[index] ?? Number.NaN;
}

export const ms = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : "—");
