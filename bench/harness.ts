import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page as BrowserPage } from "playwright-core";

/**
 * The plumbing the six benchmarks share: a private copy of a real spool project,
 * a daemon of its own, and the geometry reading that decides what to measure.
 *
 * Sharing it is not tidiness. `bench/canvas.ts` (#82) and `bench/frame-cost.ts`
 * (#85) quote numbers at each other — a per-frame cost against a per-frame
 * arrival — and two copies of "start a daemon" would eventually diverge in some
 * detail (a warmed compile cache, an update check, a leftover camera) that
 * silently makes those numbers incomparable. `copyProject` below says which
 * canvas they all measure, and why it is a frozen one.
 *
 * Run both with node's own type stripping, not tsx: in-page collectors are
 * serialized into the browser by playwright, and esbuild's keep-names transform
 * wraps every function in a `__name` helper that does not exist there.
 */

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A 14-inch MacBook Pro's default scaled window, in CSS pixels. */
export const VIEWPORT = { width: 1512, height: 945 };

/**
 * A private copy of the project, so a run leaves the real canvas untouched.
 *
 * The subject is generated, and has to be. Make a fresh detached copy from any
 * directory so neither unknown pages nor ignored app state can follow it:
 *
 *   git -C <spool-bench-source> worktree add --detach <spool-bench> 4bb16401b0e38e67bd44116c5ccc17b4e6281e6e
 *   node <spool-bench>/generate.mjs
 *
 * At the pinned commit, `generate.mjs` writes 437 frames across six pages from
 * fixed seeds, geometry, and archetype rotation. Pass that fresh project root
 * as `--project <spool-bench>`.
 *
 * A live canvas is not a benchmark subject. Frame count and which page is
 * densest move whenever someone works. App-owned state is excluded below; each
 * benchmark establishes the state it needs inside the temporary copy.
 */
export function copyProject(source: string): { root: string; name: string; spoolDir: string } {
	const design = join(source, "design");
	if (!existsSync(join(design, "canvas.json"))) throw new Error(`${source} has no design/canvas.json`);
	const work = mkdtempSync(join(tmpdir(), "spool-bench-"));
	const root = join(work, basename(source));
	mkdirSync(root, { recursive: true });
	cpSync(design, join(root, "design"), { recursive: true });
	const copiedState = join(root, "design", ".spool");
	rmSync(copiedState, { recursive: true, force: true });
	mkdirSync(copiedState, { recursive: true });
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
	// Only the benchmark daemon sees this empty browser store. Its headless
	// healer stays unavailable, so the canvas lifecycle is the sole cover
	// writer and prepareCurrentCovers's exact-one check is the barrier.
	const emptyBrowserStore = mkdtempSync(join(spoolDir, "no-headless-"));
	const daemonEnv = { ...env, PLAYWRIGHT_BROWSERS_PATH: emptyBrowserStore };
	const child = spawn(process.execPath, [cli, "serve", "--foreground"], {
		env: { ...process.env, ...daemonEnv },
	});
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

/**
 * A frame as the benchmarks need it: where it sits, how big it was authored.
 * `name` is the bare leaf, because that is a frame's identity everywhere else —
 * the iframe's title, and the last segment of its document URL. The page it
 * sits on is a separate field, exactly as `projection.ts` keeps it.
 */
export interface FrameBox extends Box {
	name: string;
	page: string;
}

const COVER_SETUP_TIMEOUT_MS = 600_000;
const CURRENT_COVER = /^[0-9a-f]{32}\.(?:jpg|png)$/;

/** Remove only the copied project's cover store. The source project is never passed here. */
export function clearCopiedCovers(root: string): void {
	rmSync(join(root, "design", ".spool", "thumbs"), { recursive: true, force: true });
}

function frameDirectory(root: string, frame: { name: string; page: string }): string {
	return join(root, "design", "frames", ...(frame.page === ROOT_PAGE ? [] : [frame.page]), frame.name);
}

function assertHtmlFrames(root: string, frames: readonly { name: string; page: string }[]): void {
	const terminals = frames.filter((frame) => existsSync(join(frameDirectory(root, frame), "term.tsx")));
	if (terminals.length === 0) return;
	const sample = terminals
		.slice(0, 6)
		.map((frame) => frame.name)
		.join(", ");
	throw new Error(
		`cover setup cannot create images for ${terminals.length} terminal frames` +
			` (${sample}${terminals.length > 6 ? ", …" : ""})`,
	);
}

function missingCurrentCoverNames(root: string, frames: readonly { name: string }[]): string[] {
	const thumbs = join(root, "design", ".spool", "thumbs");
	const missing: string[] = [];
	for (const frame of frames) {
		let files: string[] = [];
		try {
			files = readdirSync(join(thumbs, frame.name));
		} catch {
			files = [];
		}
		const images = files.filter((file) => CURRENT_COVER.test(file));
		if (files.length !== 1 || images.length !== 1) missing.push(frame.name);
	}
	return missing;
}

/**
 * Let the shipped canvas build one current cover per frame in the private copy.
 * `startDaemon` disables its fallback healer, so exact-one completion proves the
 * canvas lifecycle wrote every cover. The caller sets that page's picture-zoom
 * camera before entry and resets its measurement camera after this returns.
 */
export async function prepareCurrentCovers(
	browser: Browser,
	url: string,
	root: string,
	frames: readonly { name: string; page: string }[],
): Promise<void> {
	assertHtmlFrames(root, frames);
	const pageName = frames[0]?.page === ROOT_PAGE ? "root" : (frames[0]?.page ?? "unknown");
	process.stderr.write(`bench: preparing ${frames.length} current covers on page "${pageName}"\n`);
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	const page = await context.newPage();
	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });
		const deadline = Date.now() + COVER_SETUP_TIMEOUT_MS;
		let missing = missingCurrentCoverNames(root, frames);
		while (missing.length > 0 && Date.now() < deadline) {
			await page.waitForTimeout(250);
			missing = missingCurrentCoverNames(root, frames);
		}
		if (missing.length > 0) {
			const sample = missing.slice(0, 6).join(", ");
			throw new Error(
				`cover setup timed out after ${COVER_SETUP_TIMEOUT_MS / 1000} s: ` +
					`${missing.length} of ${frames.length} frames still lacked one current image` +
					` (${sample}${missing.length > 6 ? ", …" : ""})`,
			);
		}
		process.stderr.write(`bench: prepared ${frames.length} current covers on page "${pageName}"\n`);
	} finally {
		await context.close();
		// A closing canvas can still have its camera save in flight. Let it land
		// before the caller writes the measurement camera.
		await new Promise((wait) => setTimeout(wait, 1500));
	}
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

/** The root page is the frames directory itself, spelled "" — `ui/canvas/pages.ts`. */
export const ROOT_PAGE = "";

/**
 * One page's frames, and the page they sit on — what a single camera can show.
 * Not playwright's `Page`, which is imported above under another name for
 * exactly this reason.
 */
export interface Page {
	page: string;
	frames: FrameBox[];
}

/**
 * The frames sharing one camera. Both layouts are read: `frames/<frame>/`
 * today, and `frames/<page>/<frame>/` after #89's hard cut, which would
 * otherwise leave this finding nothing and planning a camera over an empty
 * canvas. A page is the larger group under the page layout, since that is the
 * one canvas a single camera can put the most documents on screen at once.
 *
 * The root page wins outright when it holds anything, because a canvas opens
 * there unless its state says otherwise.
 */
export function readPages(root: string): Page[] {
	const dir = join(root, "design", "frames");
	const flat: FrameBox[] = [];
	const pages: Page[] = [];
	for (const name of readdirSync(dir)) {
		const direct = readBox(join(dir, name, "frame.json"));
		if (direct !== undefined) {
			flat.push({ ...direct, name, page: ROOT_PAGE });
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
			if (box !== undefined) boxes.push({ ...box, name: child, page: name });
		}
		if (boxes.length > 0) pages.push({ page: name, frames: boxes });
	}
	// the root page wins outright when it holds anything, because a canvas opens
	// there unless its state says otherwise
	return flat.length > 0 ? [{ page: ROOT_PAGE, frames: flat }] : pages;
}

export function densestPage(root: string): Page {
	let widest: Page = { page: ROOT_PAGE, frames: [] };
	for (const page of readPages(root)) if (page.frames.length > widest.frames.length) widest = page;
	return widest;
}

/** One named page — a sweep whose interesting distribution is not on the densest one. */
export function namedPage(root: string, name: string): Page {
	const found = readPages(root).find((page) => page.page === name);
	if (found === undefined) throw new Error(`no page "${name}" in ${root}/design/frames`);
	return found;
}

/**
 * The picture zoom used while benchmarks populate covers. Reload also keeps it
 * as its historical measurement default; readable arrival and canvas runs own
 * their separate defaults.
 */
export const DEFAULT_ZOOM = 0.16;

export interface Camera {
	x: number;
	y: number;
	k: number;
}

/**
 * The camera a whole-canvas run starts from: the densest band of this canvas,
 * centred on the frame with the most neighbours inside one screen. Left to its
 * own saved camera a project opens wherever it was last dragged, which measures
 * an idle canvas rather than the one the map is about.
 */
export function planCamera(boxes: Box[], width: number, height: number, k: number): Camera {
	const spanX = width / k;
	const spanY = height / k;
	let best: { x: number; y: number; count: number } | null = null;
	const centres = boxes.map((box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 }));
	for (const candidate of centres) {
		const count = centres.filter(
			(centre) => Math.abs(centre.y - candidate.y) <= spanY / 2 && Math.abs(centre.x - candidate.x) <= spanX / 2,
		).length;
		if (best === null || count > best.count) best = { x: candidate.x, y: candidate.y, count };
	}
	// Both coordinates come from the winning frame's own centre. Taking x from
	// the mean of every centre instead put the camera between the frames on any
	// canvas wider than the window: above about k = 0.6 it aimed at empty world
	// and the run measured a screen with nothing on it. `bench/arrival.ts`
	// caught that at k = 1.0 with a guard of its own; #112's overview-zoom bar
	// walks into it head-on, because entering from an overview is the case it
	// makes ordinary.
	return { x: width / 2 - (best?.x ?? 0) * k, y: height / 2 - (best?.y ?? 0) * k, k };
}

/**
 * Rewrite the persisted camera before every run: the canvas saves its own on
 * settle, so a second run would otherwise open where the first one's gestures
 * left off rather than where the measurement was planned.
 *
 * The page has to be written with it. `resolveActivePage` falls back to the
 * root page when the state does not name one, so a state file carrying only a
 * camera opens a migrated project on a root page that holds no frames — the
 * canvas mounts nothing and the run measures an empty screen rather than
 * failing. `camerasFromState` reads the root page's camera from the original
 * `camera` slot and every named page's from `pageCameras`, so which slot the
 * planned camera goes in follows the page.
 */
export function writeCamera(root: string, camera: Camera, page: string = ROOT_PAGE): void {
	const slots = page === ROOT_PAGE ? { camera } : { activePage: page, pageCameras: { [page]: camera } };
	writeFileSync(
		join(root, "design", ".spool", "state.json"),
		`${JSON.stringify({ ...slots, arrows: true }, null, "\t")}\n`,
	);
}

export function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return Number.NaN;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
	return sorted[index] ?? Number.NaN;
}

export const ms = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : "—");

/** Documents the canvas is holding right now. */
export const mountedCount = (page: BrowserPage): Promise<number> =>
	page.evaluate(() => document.querySelectorAll("iframe").length);

/** Documents hidden behind a still. With no selection intent, these are picture errands. */
const hiddenDocumentCount = (page: BrowserPage): Promise<number> =>
	page.evaluate(
		() =>
			[...document.querySelectorAll("iframe")].filter((frame) => getComputedStyle(frame).visibility === "hidden")
				.length,
	);

/** One label per frame shell, independent of its live or picture substrate. */
export const framesOnCanvas = (page: BrowserPage): Promise<number> =>
	page.evaluate(() => document.querySelectorAll("[data-frame-label]").length);

/**
 * Hold until no hidden document is being borrowed for a picture. Readable
 * documents stay visible at rest, so a zero-document check would never finish.
 * A canvas pinned at the errand cap can keep the same total count while the
 * borrowed frames change, so a stable-count check would finish too early.
 * Returns the borrowed count left at timeout.
 */
export async function quiet(page: BrowserPage, timeoutMs: number): Promise<number> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const count = await hiddenDocumentCount(page);
		if (count === 0) return 0;
		await page.waitForTimeout(250);
	}
	const left = await hiddenDocumentCount(page);
	process.stderr.write(
		`bench:   canvas still borrowing ${left} frames — whatever runs next is not measured from rest\n`,
	);
	return left;
}
