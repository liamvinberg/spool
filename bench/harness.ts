import { execFileSync, spawn } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { loadavg, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page as BrowserPage } from "playwright-core";

/**
 * The plumbing the benchmarks share: a private copy of a real spool project, a
 * daemon of its own, the geometry reading that decides what to measure, and
 * the builds and interleaved rounds that compare one spool version with another.
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
 *   git -C <spool-bench-source> worktree add --detach <spool-bench> 4e3024560fb40f6ee41d27dea683587f28dd780b
 *   node <spool-bench>/generate.mjs
 *
 * At the pinned commit, `generate.mjs` writes 1449 frames across eight pages:
 * seven from fixed seeds, geometry, and archetype rotation, `n1000` the
 * densest, and the twelve `dither` specimens `bench/dither-attribution.ts`
 * measures. Pass that fresh project root as `--project <spool-bench>`.
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

/**
 * A spool build to measure: a checkout whose `dist/cli.js` serves the daemon
 * and the canvas. The benchmark's own code always comes from this checkout, so
 * two builds differ in the product under test and nothing else. Its commit, and
 * whether what it is built from had uncommitted edits, go into every report, so
 * a comparison's numbers say which code they were taken on.
 */
export interface Build {
	label: string;
	checkout: string;
	cli: string;
	commit: string;
	dirty: boolean;
}

/**
 * What `pnpm build` reads. Dirty is judged over these alone: a daemon run saves
 * `design/` itself, so a whole checkout that has ever been measured is never
 * clean.
 */
const BUILD_INPUTS = [
	"src",
	"package.json",
	"pnpm-lock.yaml",
	"tsconfig.json",
	"tsconfig.runtime.json",
	"tsconfig.ui.json",
	"tsup.config.ts",
	"vite.config.ts",
];

const git = (checkout: string, args: string[]): string =>
	execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();

/** The newest modification time under a path, a file or a whole directory. */
function newest(path: string): number {
	const stat = statSync(path);
	if (!stat.isDirectory()) return stat.mtimeMs;
	let found = 0;
	for (const entry of readdirSync(path)) found = Math.max(found, newest(join(path, entry)));
	return found;
}

/**
 * One checkout's build. A `dist/` older than anything it is built from is
 * refused: it is some earlier state of the code, and the commit the report
 * would print beside its numbers is not the code that produced them.
 */
function readBuild(label: string, checkout: string): Build {
	const root = realpathSync(resolve(checkout));
	const cli = join(root, "dist/cli.js");
	if (!existsSync(cli)) throw new Error(`${cli} is missing — run pnpm build in ${root} first`);
	const inputs = BUILD_INPUTS.filter((input) => existsSync(join(root, input)));
	if (statSync(cli).mtimeMs < Math.max(...inputs.map((input) => newest(join(root, input))))) {
		throw new Error(`${cli} is older than the sources it is built from — run pnpm build in ${root} first`);
	}
	return {
		label,
		checkout: root,
		cli,
		commit: git(root, ["rev-parse", "HEAD"]),
		dirty: git(root, ["status", "--porcelain", "--", ...inputs]) !== "",
	};
}

/**
 * `base=<spool checkout>,cand=<spool checkout>`. Two labels on one `dist/`
 * would report one build twice as a comparison, so each build needs a checkout
 * of its own: a detached worktree per commit, each installed and built.
 */
function parseBuilds(spec: string): Build[] {
	const builds = spec.split(",").map((entry): Build => {
		const at = entry.indexOf("=");
		if (at <= 0) throw new Error(`--builds takes label=<spool checkout>, got "${entry}"`);
		return readBuild(entry.slice(0, at).trim(), entry.slice(at + 1).trim());
	});
	if (new Set(builds.map((build) => build.label)).size !== builds.length) {
		throw new Error("--builds needs distinct labels");
	}
	if (new Set(builds.map((build) => build.cli)).size !== builds.length) {
		throw new Error("--builds names one dist/ twice; give each build a checkout of its own");
	}
	return builds;
}

/**
 * Rotating the order evens out whatever drifts across a session only over a
 * whole number of turns, so the rounds must be a multiple of the builds: two
 * builds run AB then BA.
 */
function assertBalanced(builds: readonly unknown[], rounds: number): void {
	if (!Number.isInteger(rounds) || rounds < 1) throw new Error("--rounds takes a positive whole number");
	if (rounds % builds.length !== 0) {
		throw new Error(
			`--rounds ${rounds} is not a multiple of the ${builds.length} builds, so the order is not balanced`,
		);
	}
}

/**
 * `--builds` and `--rounds`, taken out of a benchmark's arguments and checked
 * before a copy, a daemon or a browser exists. With no `--builds` the one build
 * is this checkout's. `rest` is left for the benchmark's own options.
 */
export function takeBuildOptions(argv: readonly string[]): { builds: Build[]; rounds: number; rest: string[] } {
	let builds: Build[] | undefined;
	let rounds = 1;
	const rest: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string;
		const next = argv[i + 1];
		if (arg === "--builds" && next !== undefined) {
			builds = parseBuilds(next);
			i++;
		} else if (arg === "--rounds" && next !== undefined) {
			rounds = Number(next);
			i++;
		} else {
			rest.push(arg);
		}
	}
	const chosen = builds ?? [readBuild("this", repoRoot)];
	assertBalanced(chosen, rounds);
	return { builds: chosen, rounds, rest };
}

const describeBuild = (build: Build): string =>
	`${build.label} = ${build.checkout} at ${build.commit.slice(0, 12)}${build.dirty ? " (uncommitted source edits)" : ""}`;

/** The one-minute load average now, the figure `sysctl -n vm.loadavg` leads with. */
export const oneMinuteLoad = (): number => loadavg()[0] ?? Number.NaN;

/** One build's private copy of the subject, and the daemon its build serves that copy with. */
export interface Subject {
	build: Build;
	root: string;
	url: string;
	daemon: Daemon;
}

/**
 * A private copy and a daemon of its own for every build. The copies are of one
 * source, so the builds differ in the product alone, and every copy is measured
 * on the same page. A daemon that fails to start stops the ones already up.
 */
export async function startSubjects(
	project: string,
	builds: readonly Build[],
	pageName: string | undefined,
): Promise<{ subjects: Subject[]; page: Page }> {
	const subjects: Subject[] = [];
	let page: Page = { page: ROOT_PAGE, frames: [] };
	try {
		for (const build of builds) {
			process.stderr.write(`bench: build ${describeBuild(build)}\n`);
			const { root, name, spoolDir } = copyProject(project);
			page = pageToMeasure(root, pageName);
			// a camera planned over nothing is a run that measures an empty canvas
			// and reports it as fast
			if (page.frames.length === 0) throw new Error(`${project} has no frames to measure`);
			const daemon = await startDaemon(spoolDir, root, await freePort(), build.cli);
			const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
			subjects.push({ build, root, url, daemon });
			process.stderr.write(
				`bench: ${build.label} ${url} (copy of ${project}, page "${page.page === ROOT_PAGE ? "root" : page.page}", ${page.frames.length} frames)\n`,
			);
		}
	} catch (error) {
		stopSubjects(subjects);
		throw error;
	}
	return { subjects, page };
}

export function stopSubjects(subjects: readonly Subject[]): void {
	for (const subject of subjects) subject.daemon.stop();
}

export interface BuildRun<T> {
	build: string;
	round: number;
	result: T;
}

/**
 * Every build once per round, the order rotated each round, so whatever drifts
 * across a session (other work on the machine, heat, a warming cache) lands on
 * every build alike instead of on whichever always runs second.
 */
export async function interleave<T>(
	subjects: readonly Subject[],
	rounds: number,
	run: (subject: Subject) => Promise<T>,
): Promise<BuildRun<T>[]> {
	assertBalanced(subjects, rounds);
	const runs: BuildRun<T>[] = [];
	for (let round = 0; round < rounds; round++) {
		for (let turn = 0; turn < subjects.length; turn++) {
			const subject = subjects[(turn + round) % subjects.length] as Subject;
			process.stderr.write(`bench: round ${round + 1}/${rounds}, build ${subject.build.label}\n`);
			runs.push({ build: subject.build.label, round, result: await run(subject) });
		}
	}
	return runs;
}

/** The builds a report was taken on, and the order their rounds ran in. */
export function buildsHeader(subjects: readonly Subject[], runs: readonly BuildRun<unknown>[], rounds: number): string {
	const lines = subjects.map((subject) => `build ${describeBuild(subject.build)}`);
	if (rounds > 1) {
		const order = Array.from({ length: rounds }, (_, round) =>
			runs
				.filter((run) => run.round === round)
				.map((run) => run.build)
				.join(" "),
		);
		lines.push("", `${rounds} rounds, build order rotated every round: ${order.join(" | ")}`);
	}
	return lines.join("\n");
}

export async function startDaemon(
	spoolDir: string,
	root: string,
	port: number,
	cli = join(repoRoot, "dist/cli.js"),
): Promise<Daemon> {
	if (!existsSync(cli)) throw new Error(`${cli} is missing — run pnpm build first`);
	const env = { SPOOL_DIR: spoolDir, SPOOL_PORT: String(port) };
	await run(process.execPath, [cli, "open", root], env);
	// A checkout whose daemon makes every cover in its photo booth
	// (src/daemon/booth.ts) keeps the machine's pinned headless shell: the booth
	// is its one cover writer. An older checkout has its headless healer switched
	// off with an empty browser store, so its canvas lifecycle is the one cover
	// writer, the way those builds were always measured. Either way
	// prepareCurrentCovers's exact-one check is the barrier.
	const booth = existsSync(join(dirname(dirname(cli)), "src", "daemon", "booth.ts"));
	const daemonEnv = booth ? env : { ...env, PLAYWRIGHT_BROWSERS_PATH: mkdtempSync(join(spoolDir, "no-headless-")) };
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
 * `name` is the full path under `frames/` (`n200/n200-001`), because that is a
 * frame's identity everywhere since #336: the iframe's title, its label, its
 * loaded report, its encoded document URL and its cover directory. The page it
 * sits on is kept beside it for the camera.
 */
export interface FrameBox extends Box {
	name: string;
	page: string;
}

const COVER_SETUP_TIMEOUT_MS = 600_000;
const COVER_SETUP_MS_PER_FRAME = 1500;
const CURRENT_COVER = /^[0-9a-f]{32}\.(?:jpg|png)$/;

/** Remove only the copied project's cover store. The source project is never passed here. */
export function clearCopiedCovers(root: string): void {
	rmSync(join(root, "design", ".spool", "thumbs"), { recursive: true, force: true });
}

function frameDirectory(root: string, frame: { name: string }): string {
	return join(root, "design", "frames", frame.name);
}

function assertHtmlFrames(root: string, frames: readonly { name: string }[]): void {
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
			// the daemon keeps a frame's covers under its whole path, encoded
			files = readdirSync(join(thumbs, encodeURIComponent(frame.name)));
		} catch {
			files = [];
		}
		const images = files.filter((file) => CURRENT_COVER.test(file));
		// one image, beside nothing but the colour scheme a scheme-following frame was taken in
		if (images.length !== 1 || files.some((file) => file !== images[0] && file !== "scheme")) {
			missing.push(frame.name);
		}
	}
	return missing;
}

/**
 * Let the build's one cover writer make one current cover per frame in the
 * private copy: the daemon's photo booth, or in a build from before it the
 * shipped canvas lifecycle (`startDaemon`). Opening the page is what asks
 * either way: the canvas's projection read finds every frame uncovered, and the
 * booth photographs them, the ones on screen first, where the older canvas
 * borrowed them in turn. The caller sets that page's picture-zoom camera before
 * entry and resets its measurement camera after this returns.
 */
export async function prepareCurrentCovers(
	browser: Browser,
	url: string,
	root: string,
	frames: readonly { name: string; page: string }[],
): Promise<number> {
	assertHtmlFrames(root, frames);
	const pageName = frames[0]?.page === ROOT_PAGE ? "root" : (frames[0]?.page ?? "unknown");
	process.stderr.write(`bench: preparing ${frames.length} current covers on page "${pageName}"\n`);
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	const page = await context.newPage();
	try {
		// from the canvas opening to its last cover: the whole job, boot included
		const started = Date.now();
		await page.goto(url, { waitUntil: "domcontentloaded" });
		// a ceiling, not an estimate: an idle M1 Pro makes 200 covers in about a
		// minute, a loaded one several times slower, and n1000 is five times 200
		const timeoutMs = Math.max(COVER_SETUP_TIMEOUT_MS, frames.length * COVER_SETUP_MS_PER_FRAME);
		let missing = missingCurrentCoverNames(root, frames);
		while (missing.length > 0 && Date.now() < started + timeoutMs) {
			await page.waitForTimeout(250);
			missing = missingCurrentCoverNames(root, frames);
		}
		if (missing.length > 0) {
			const sample = missing.slice(0, 6).join(", ");
			throw new Error(
				`cover setup timed out after ${timeoutMs / 1000} s: ` +
					`${missing.length} of ${frames.length} frames still lacked one current image` +
					` (${sample}${missing.length > 6 ? ", …" : ""})`,
			);
		}
		const tookMs = Date.now() - started;
		process.stderr.write(
			`bench: prepared ${frames.length} current covers on page "${pageName}" in ${(tookMs / 1000).toFixed(1)} s\n`,
		);
		return tookMs;
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
 * Every page and its frames, the root page first when it holds any. Both
 * layouts are read: `frames/<frame>/` and `frames/<page>/<frame>/` since #89's
 * hard cut, which would otherwise leave this finding nothing and planning a
 * camera over an empty canvas.
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
			if (box !== undefined) boxes.push({ ...box, name: `${name}/${child}`, page: name });
		}
		if (boxes.length > 0) pages.push({ page: name, frames: boxes });
	}
	return flat.length > 0 ? [{ page: ROOT_PAGE, frames: flat }, ...pages] : pages;
}

/**
 * The page a single camera can put the most documents on. The root page wins
 * outright when it holds anything, because a canvas opens there unless its
 * state says otherwise.
 */
export function densestPage(root: string): Page {
	const pages = readPages(root);
	if (pages[0]?.page === ROOT_PAGE) return pages[0];
	let widest: Page = { page: ROOT_PAGE, frames: [] };
	for (const page of pages) if (page.frames.length > widest.frames.length) widest = page;
	return widest;
}

/** One named page — a sweep whose interesting distribution is not on the densest one. */
export function namedPage(root: string, name: string): Page {
	const found = readPages(root).find((page) => page.page === name);
	if (found === undefined) throw new Error(`no page "${name}" in ${root}/design/frames`);
	return found;
}

/** The page a run's `--page` names, or the densest one when it names none. */
export const pageToMeasure = (root: string, name: string | undefined): Page =>
	name === undefined ? densestPage(root) : namedPage(root, name);

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

/**
 * The middle of the values, the mean of the two middles when there is an even
 * number of them. `quantile(sorted, 0.5)` takes the lower of those two, which
 * over two rounds is simply the better round, so every reported median is this.
 */
export function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 0) return Number.NaN;
	const half = sorted.length / 2;
	if (!Number.isInteger(half)) return sorted[Math.floor(half)] ?? Number.NaN;
	return ((sorted[half - 1] ?? Number.NaN) + (sorted[half] ?? Number.NaN)) / 2;
}

export const ms = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : "—");

/** Documents the canvas is holding right now. */
export const mountedCount = (page: BrowserPage): Promise<number> =>
	page.evaluate(() => document.querySelectorAll("iframe").length);

/** One label per frame shell, independent of its live or picture substrate. */
export const framesOnCanvas = (page: BrowserPage): Promise<number> =>
	page.evaluate(() => document.querySelectorAll("[data-frame-label]").length);

// --- the gesture collector (#82) -------------------------------------------
//
// Shared by bench/canvas.ts and bench/dither-attribution.ts, which quote
// numbers at each other. It lives here for the same reason the rest of this
// file exists: two copies would eventually diverge in some detail that
// silently makes those numbers incomparable — and the first port had already
// diverged before this was hoisted.

export interface Sample {
	t: number;
	d: number;
	mounted: number;
}

export interface Loaf {
	t: number;
	duration: number;
	blocking: number;
}

export interface Stamped {
	frame: string;
	t: number;
}

export interface BenchState {
	raf: Sample[];
	loaf: Loaf[];
	loaded: Stamped[];
	inserted: Stamped[];
}

/**
 * Installed before any script runs, in the top document only: an init script
 * runs in every frame, and 88 copies of a MutationObserver would be measuring
 * their own cost. Every number the report quotes is read from here.
 */
export function collector(): void {
	if (window !== window.top) return;
	const state = { raf: [], loaf: [], loaded: [], inserted: [] } as unknown as BenchState;
	(globalThis as unknown as { __bench: BenchState }).__bench = state;

	let last = performance.now();
	const tick = (now: number): void => {
		state.raf.push({ t: now, d: now - last, mounted: document.querySelectorAll("iframe").length });
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);

	if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const loaf = entry as PerformanceEntry & { blockingDuration?: number };
				state.loaf.push({ t: entry.startTime, duration: entry.duration, blocking: loaf.blockingDuration ?? 0 });
			}
		}).observe({ type: "long-animation-frame", buffered: true });
	}

	// a frame's own arrival report: the canvas reads it too, this only listens
	window.addEventListener(
		"message",
		(event: MessageEvent) => {
			const data = event.data as { spool?: unknown; frame?: unknown } | null;
			if (data === null || typeof data !== "object") return;
			if (data.spool === "loaded" && typeof data.frame === "string") {
				state.loaded.push({ frame: data.frame, t: performance.now() });
			}
		},
		true,
	);

	// One entry per document, not per mutation record. A frame reaching the DOM
	// arrives as a container and, inside it, the wrapper the freeze lock lives on
	// (#112): both are added nodes in the same batch, and walking each for nested
	// iframes finds the same one twice.
	const counted = new WeakSet<HTMLIFrameElement>();
	const noteIframe = (node: Node): void => {
		const found =
			node instanceof HTMLIFrameElement
				? [node]
				: node instanceof HTMLElement
					? node.querySelectorAll("iframe")
					: [];
		for (const el of found) {
			if (counted.has(el)) continue;
			counted.add(el);
			state.inserted.push({ frame: el.title, t: performance.now() });
		}
	};
	// document, not documentElement: an init script runs before <html> exists
	new MutationObserver((records) => {
		for (const record of records) for (const node of record.addedNodes) noteIframe(node);
	}).observe(document, { childList: true, subtree: true });
}

export interface GestureStats {
	p50: number;
	p95: number;
	worst: number;
	rareIntervals: number;
	loafs: number;
	loafWorstBlocking: number;
	frames: number;
	mountedPeak: number;
	wallMs: number;
}

export const RARE_INTERVAL_MS = 12;

export function windowStats(state: BenchState, from: number, to: number): GestureStats {
	const inside = state.raf.filter((sample) => sample.t >= from && sample.t <= to);
	const deltas = inside.map((sample) => sample.d).sort((a, b) => a - b);
	const loafs = state.loaf.filter((entry) => entry.t >= from && entry.t <= to);
	return {
		p50: quantile(deltas, 0.5),
		p95: quantile(deltas, 0.95),
		worst: deltas.at(-1) ?? Number.NaN,
		rareIntervals: deltas.filter((delta) => delta > RARE_INTERVAL_MS).length,
		loafs: loafs.length,
		loafWorstBlocking: loafs.reduce((worst, entry) => Math.max(worst, entry.blocking), 0),
		frames: deltas.length,
		mountedPeak: inside.reduce((peak, sample) => Math.max(peak, sample.mounted), 0),
		wallMs: to - from,
	};
}

export const now = (page: BrowserPage): Promise<number> => page.evaluate(() => performance.now());
export const read = (page: BrowserPage): Promise<BenchState> =>
	page.evaluate(() => (globalThis as unknown as { __bench: BenchState }).__bench);

/**
 * Hold until the canvas stops mounting: the count unchanged across `stableMs`.
 * Reports when it stopped changing, not when the waiting ended, so "looks
 * complete" is not inflated by the window that proves it.
 *
 * The count is watched only once the canvas has drawn a frame shell. A canvas
 * still booting holds no documents either, and on a loaded machine its UI can
 * take seconds to draw, long enough for a count of zero to look stable. The
 * draw gets its own wait, so a late one leaves the stability check its whole
 * window; a page that never draws goes on to be checked as it is, and the
 * caller's empty-screen guard says so. A count that never holds still for
 * `stableMs` within `timeoutMs` is not a settled canvas, and throws.
 */
export async function settle(
	page: BrowserPage,
	stableMs: number,
	timeoutMs: number,
): Promise<{ count: number; stableAt: number }> {
	await page.waitForSelector("[data-frame-label]", { state: "attached", timeout: timeoutMs }).catch(() => undefined);
	const deadline = Date.now() + timeoutMs;
	let count = await mountedCount(page);
	let since = Date.now();
	while (Date.now() < deadline) {
		await page.waitForTimeout(150);
		const next = await mountedCount(page);
		if (next !== count) {
			count = next;
			since = Date.now();
		} else if (Date.now() - since >= stableMs) return { count, stableAt: since };
	}
	throw new Error(`the canvas never held its document count still for ${stableMs} ms in ${timeoutMs / 1000} s`);
}

/**
 * `settle`, then a refusal to go on over an empty screen: a canvas showing
 * nothing is fast at everything, and every number taken over it would read as
 * good news.
 */
export async function settleOnFrames(
	page: BrowserPage,
	stableMs: number,
	timeoutMs: number,
): Promise<{ count: number; stableAt: number }> {
	const settled = await settle(page, stableMs, timeoutMs);
	if ((await framesOnCanvas(page)) === 0) {
		throw new Error("the canvas settled with no frames on screen, so this run would measure an empty screen");
	}
	return settled;
}

export const PAN_EVENTS = 90;
export const PAN_STEP_PX = 26;
export const ZOOM_EVENTS = 60;
export const ZOOM_STEP_PX = 4; // ~3.7x in and back out across the gesture
export const WHEEL_INTERVAL_MS = 1000 / 60;

export async function driveRoundTripWheel(
	page: BrowserPage,
	steps: number,
	deltaX: number,
	deltaY: number,
): Promise<void> {
	const started = performance.now();
	for (let step = 0; step < steps; step++) {
		const direction = step < steps / 2 ? 1 : -1;
		await page.mouse.wheel(direction * deltaX, direction * deltaY);
		const delay = started + (step + 1) * WHEEL_INTERVAL_MS - performance.now();
		if (delay > 0) await page.waitForTimeout(delay);
	}
}
