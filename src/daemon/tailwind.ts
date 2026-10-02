import { readFileSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { Scanner } from "@tailwindcss/oxide";
import { compile } from "tailwindcss";
import { DesignBoundaryError, resolveDesignPath } from "./design-path";
import { spoolEntry } from "./spool-entry";

/**
 * Serve-time Tailwind (#15): frames receive finished CSS, compiled with the
 * Tailwind pinned inside spool. The stylesheet loader below is the pin —
 * "tailwindcss" imports resolve into spool's own install, never a product's,
 * and tokens.css is the only project entry into the compile.
 */

const tailwindDir = realpathSync(dirname(fileURLToPath(import.meta.resolve("tailwindcss/index.css"))));

function isWithin(base: string, target: string): boolean {
	const rel = relative(base, target);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/**
 * The layer every project stylesheet the frame bundle carries is wrapped in
 * (#323), and the one the frame document names its bundled block by.
 *
 * A plain `.company-byline { font-size: 13px }` arrives unlayered, and an
 * unlayered declaration outranks every layered one whatever its specificity —
 * so a `text-[20px]` the hand wrote, which Tailwind emits inside `utilities`,
 * lost to it unconditionally. Naming a layer for the project's own sheets is
 * what puts the two in the order a person expects: the agent's stylesheet is
 * the ground, and a utility written on top of it wins.
 *
 * It sits above `base` rather than at the bottom, because `base` is preflight
 * — `* { margin: 0; padding: 0 }` — and a project's own margins have always
 * beaten it. Below `components` and `utilities`, which is the whole point.
 */
export const PROJECT_LAYER = "project";

export const ROOT_CSS = `@layer theme, base, ${PROJECT_LAYER}, components, utilities;
@import "tailwindcss";
@import "./tokens.css";
`;

export interface FrameCss {
	css: string;
	/** Project stylesheets the compile read (tokens.css plus its relative @imports) — they are cache inputs. */
	stylesheets: string[];
}

/** What a compile of this project's stylesheets needs, and what it read. */
export interface DesignStylesheets {
	base: string;
	loadStylesheet: (id: string, base: string) => Promise<{ path: string; base: string; content: string }>;
	loadModule: () => Promise<never>;
	/** Project stylesheets read so far; filled as the compile resolves imports. */
	stylesheets: Set<string>;
}

/**
 * The one way into a project's stylesheets.
 *
 * It is where the pin lives: "tailwindcss" resolves into spool's own install
 * and nowhere else, a relative import resolves inside design/ or is refused,
 * and anything else is not an import this daemon serves.
 */
export function designStylesheets(designDir: string): DesignStylesheets {
	const stylesheets = new Set<string>();

	async function loadStylesheet(id: string, base: string): Promise<{ path: string; base: string; content: string }> {
		let file: string;
		if (id === "tailwindcss") {
			file = join(tailwindDir, "index.css");
		} else if (id.startsWith("tailwindcss/")) {
			file = join(tailwindDir, id.slice("tailwindcss/".length));
		} else if (id.startsWith("./") || id.startsWith("../")) {
			file = resolve(base, id);
		} else {
			throw new Error(
				`unsupported import "${id}" — only tailwindcss and relative stylesheets resolve in tokens.css`,
			);
		}
		// Spool's pinned Tailwind install is the only non-design stylesheet
		// root. Component-aware containment prevents prefix siblings from
		// masquerading as package internals.
		if (isWithin(tailwindDir, file)) {
			file = realpathSync(file);
			if (!isWithin(tailwindDir, file)) {
				throw new Error(`tailwindcss import "${id}" resolves outside Spool's pinned Tailwind install`);
			}
		} else {
			file = resolveDesignPath(designDir, file, id);
			stylesheets.add(file);
		}
		return { path: file, base: dirname(file), content: readFileSync(file, "utf8") };
	}

	async function loadModule(): Promise<never> {
		throw new Error("@plugin and @config are not supported in tokens.css");
	}

	return { base: join(designDir, "shared"), loadStylesheet, loadModule, stylesheets };
}

/**
 * Compile the finished stylesheet for one frame document here, wherever it is
 * called: theme + preflight + the utilities its source closure
 * actually uses. A fresh compiler per call keeps the output a pure function of
 * the read stylesheets and the given files — Tailwind's build() accumulates
 * candidates across calls, which would bleed one frame's utilities into the
 * next document. The same accumulation is why one compiler cannot serve a
 * whole project either: build() also marks every theme variable a frame used,
 * and the marks decide which variables the next frame's stylesheet carries.
 *
 * The daemon never calls this on its event loop: it calls
 * compileFrameCssOnWorker, and a stylesheet worker runs this.
 */
export async function compileFrameCssHere(designDir: string, files: string[]): Promise<FrameCss> {
	const sheets = designStylesheets(designDir);
	const compiler = await compile(ROOT_CSS, {
		base: sheets.base,
		loadStylesheet: sheets.loadStylesheet,
		loadModule: sheets.loadModule,
	});
	const scanner = new Scanner({ sources: [] });
	const sources = files.flatMap((file) => {
		let content: string;
		try {
			content = readFileSync(resolveDesignPath(designDir, file), "utf8");
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			return [];
		}
		return [{ content, extension: extname(file).slice(1) }];
	});
	return { css: compiler.build(scanner.scanFiles(sources)), stylesheets: [...sheets.stylesheets] };
}

/**
 * How many stylesheet workers compile frame stylesheets for this daemon.
 *
 * A frame's stylesheet was most of the work its compile did on the daemon's
 * event loop, in chunks the loop cannot break up: Tailwind's setup,
 * reading and scanning the frame's files, then build(). On Spool's own canvas
 * that came to about 10ms a frame, 5 of them in build() alone, while esbuild
 * bundles in a process of its own. A few compiles in flight, as when every
 * cover is photographed or the player composes a project, stacked those chunks
 * into stalls of tens of milliseconds in which the daemon answered nothing. On
 * a stylesheet worker the same work costs the daemon a message each way.
 *
 * Two: with three compiles in flight one worker already keeps pace, because
 * esbuild's half of a compile is the slower one, and every worker is another
 * Tailwind's worth of memory. The second is for the player, which compiles
 * eight frames' stylesheets at once: over Spool's own canvas it composed in
 * about 15 s with two workers against 17 to 20 with one.
 */
const CSS_WORKERS = 2;

/**
 * How long one stylesheet may take on a worker, from the moment it is handed
 * over. A frame's takes milliseconds, tens when a worker holds several. A worker
 * past this is stuck, in a stylesheet that loops or a scan that never returns,
 * and every job it holds would wait forever while new ones kept arriving.
 */
const CSS_JOB_MS = 30_000;

/** One stylesheet to compile, as a stylesheet worker receives it. */
export interface CssJob {
	id: number;
	designDir: string;
	files: string[];
}

/**
 * A stylesheet worker's answer. An error crosses as its message alone, except a
 * design-boundary refusal, which carries its path so it arrives as the same
 * DesignBoundaryError it left as.
 */
export type CssReply =
	| { id: number; css: FrameCss }
	| { id: number; message: string }
	| { id: number; boundary: string };

/** Start one stylesheet worker: tailwind-worker.ts, from source or from dist. */
export function startCssWorker(): Worker {
	const entry = spoolEntry("./tailwind-worker.ts", "./tailwind-worker.js");
	return new Worker(entry.path, { execArgv: entry.execArgv });
}

interface CssWorker {
	worker: Worker;
	jobs: Map<number, { resolve: (css: FrameCss) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>;
}

/**
 * A pool of at most `size` stylesheet workers, started as jobs need them. An
 * idle worker takes a job, else a new one while the pool has room, else
 * whichever holds the fewest jobs. A worker that dies fails only the jobs it
 * held, and the next job starts another in its place. A job that outlasts
 * `timeout` fails, and its worker is stopped as stuck.
 */
export function createCssWorkers(
	start: () => Worker = startCssWorker,
	size = CSS_WORKERS,
	timeout = CSS_JOB_MS,
): (designDir: string, files: string[]) => Promise<FrameCss> {
	const workers: CssWorker[] = [];
	let lastJob = 0;

	function add(): CssWorker {
		const worker = start();
		const held: CssWorker = { worker, jobs: new Map() };
		// An idle worker never holds the process open; one with a job in hand does.
		worker.unref();
		worker.on("message", (reply: CssReply) => {
			const job = held.jobs.get(reply.id);
			if (job === undefined) return;
			held.jobs.delete(reply.id);
			clearTimeout(job.timer);
			if (held.jobs.size === 0) worker.unref();
			if ("css" in reply) job.resolve(reply.css);
			else if ("boundary" in reply) job.reject(new DesignBoundaryError(reply.boundary));
			else job.reject(new Error(reply.message));
		});
		const lost = (error: Error) => {
			const at = workers.indexOf(held);
			if (at !== -1) workers.splice(at, 1);
			for (const job of held.jobs.values()) {
				clearTimeout(job.timer);
				job.reject(error);
			}
			held.jobs.clear();
		};
		worker.on("error", lost);
		worker.on("exit", (code) => lost(new Error(`the stylesheet worker stopped (exit code ${code})`)));
		workers.push(held);
		return held;
	}

	return (designDir, files) => {
		const idle = workers.find((candidate) => candidate.jobs.size === 0);
		const chosen =
			idle ??
			(workers.length < size
				? add()
				: workers.reduce((least, next) => (next.jobs.size < least.jobs.size ? next : least)));
		const id = ++lastJob;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (!chosen.jobs.delete(id)) return;
				reject(new Error(`a frame stylesheet took longer than ${timeout / 1000} s, so its worker was stopped`));
				// its other jobs fail as the worker exits, and the next job starts a fresh one
				const at = workers.indexOf(chosen);
				if (at !== -1) workers.splice(at, 1);
				void chosen.worker.terminate();
			}, timeout);
			timer.unref();
			chosen.jobs.set(id, { resolve, reject, timer });
			chosen.worker.ref();
			chosen.worker.postMessage({ id, designDir, files } satisfies CssJob);
		});
	};
}

const daemonCssWorkers = createCssWorkers();

/**
 * The finished stylesheet for one frame document (#15): compileFrameCssHere,
 * run on one of the daemon's stylesheet workers so its event loop stays free
 * while Tailwind works.
 */
export function compileFrameCssOnWorker(designDir: string, files: string[]): Promise<FrameCss> {
	return daemonCssWorkers(designDir, files);
}
