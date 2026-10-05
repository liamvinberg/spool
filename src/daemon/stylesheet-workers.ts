import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { DesignBoundaryError, isWithin } from "./design-boundary";
import { diskDesignFiles } from "./disk-files";
import { spoolEntry } from "./spool-entry";
import {
	type CssSource,
	compileFrameCss,
	type FrameCss,
	type StylesheetRunner,
	type TailwindStylesheets,
} from "./tailwind";

let tailwindDir: string | undefined;
const pinnedSheets = new Map<string, string | undefined>();

/**
 * The stylesheets of the Tailwind installed with spool (#15), read from its
 * package and never from a project's: the pin. Each is read once.
 */
export const pinnedTailwind: TailwindStylesheets = (name) => {
	if (!pinnedSheets.has(name)) {
		tailwindDir ??= realpathSync(dirname(fileURLToPath(import.meta.resolve("tailwindcss/index.css"))));
		let content: string | undefined;
		try {
			const file = realpathSync(join(tailwindDir, name));
			// component-aware containment: a prefix sibling is no package internal
			content = isWithin(tailwindDir, file) ? readFileSync(file, "utf8") : undefined;
		} catch {
			content = undefined;
		}
		pinnedSheets.set(name, content);
	}
	return pinnedSheets.get(name);
};

/**
 * Compile one frame document's stylesheet here, from the disk and the
 * Tailwind installed with spool: what a stylesheet worker runs.
 */
export function compileFrameCssHere(designDir: string, sources: CssSource[]): Promise<FrameCss> {
	return compileFrameCss(designDir, sources, { files: diskDesignFiles, tailwind: pinnedTailwind });
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
 * How long one stylesheet may take once its worker begins it. A frame's takes
 * milliseconds, tens when a worker holds several. A worker past this is stuck,
 * in a stylesheet that loops or a scan that never returns, and every job it
 * holds would wait forever while new ones kept arriving.
 */
const CSS_JOB_MS = 30_000;

/** One stylesheet to compile, as a stylesheet worker receives it. */
export interface CssJob {
	id: number;
	designDir: string;
	sources: CssSource[];
}

/**
 * A stylesheet worker's word on a job: that it has begun it, then its answer.
 * An error crosses as its message alone, except a design-boundary refusal,
 * which carries its path so it arrives as the same DesignBoundaryError it left
 * as.
 */
export type CssReply =
	| { id: number; started: true }
	| { id: number; css: FrameCss }
	| { id: number; message: string }
	| { id: number; boundary: string };

/** Start one stylesheet worker: tailwind-worker.ts, from source or from dist. */
export function startCssWorker(): Worker {
	const entry = spoolEntry("./tailwind-worker.ts", "./tailwind-worker.js");
	return new Worker(entry.path, { execArgv: entry.execArgv });
}

interface PendingCss {
	designDir: string;
	sources: CssSource[];
	resolve: (css: FrameCss) => void;
	reject: (error: Error) => void;
	/** The job's deadline, set once its worker begins it. */
	timer: NodeJS.Timeout | undefined;
}

interface CssWorker {
	worker: Worker;
	jobs: Map<number, PendingCss>;
}

/**
 * A pool of at most `size` stylesheet workers, started as jobs need them. An
 * idle worker takes a job, else a new one while the pool has room, else
 * whichever holds the fewest jobs. A worker that dies fails only the jobs it
 * held, and the next job starts another in its place. A job its worker has
 * been at for longer than `timeout` fails; that worker is stopped as stuck,
 * and the jobs it held besides move to one that answers.
 */
export function createCssWorkers(
	start: () => Worker = startCssWorker,
	size = CSS_WORKERS,
	timeout = CSS_JOB_MS,
): (designDir: string, sources: CssSource[]) => Promise<FrameCss> {
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
			if ("started" in reply) {
				// from here, not from the handoff: time spent queued behind the
				// worker's other jobs is not this one's
				job.timer = setTimeout(() => stuck(held, reply.id), timeout);
				job.timer.unref();
				return;
			}
			held.jobs.delete(reply.id);
			clearTimeout(job.timer);
			if (held.jobs.size === 0) worker.unref();
			if ("css" in reply) job.resolve(reply.css);
			else if ("boundary" in reply) job.reject(new DesignBoundaryError(reply.boundary));
			else job.reject(new Error(reply.message));
		});
		const lost = (error: Error) => {
			retire(held);
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

	function retire(held: CssWorker): void {
		const at = workers.indexOf(held);
		if (at !== -1) workers.splice(at, 1);
	}

	/** A job past its deadline fails, its worker is stopped, and the rest it held go to another. */
	function stuck(held: CssWorker, id: number): void {
		const job = held.jobs.get(id);
		if (job === undefined) return;
		retire(held);
		const others = [...held.jobs.values()].filter((other) => other !== job);
		held.jobs.clear();
		for (const pending of [job, ...others]) clearTimeout(pending.timer);
		job.reject(new Error(`this frame's stylesheet took longer than ${timeout / 1000} s to compile`));
		void held.worker.terminate();
		for (const other of others) hand(other);
	}

	function hand(job: PendingCss): void {
		const idle = workers.find((candidate) => candidate.jobs.size === 0);
		const chosen =
			idle ??
			(workers.length < size
				? add()
				: workers.reduce((least, next) => (next.jobs.size < least.jobs.size ? next : least)));
		const id = ++lastJob;
		job.timer = undefined;
		chosen.jobs.set(id, job);
		chosen.worker.ref();
		chosen.worker.postMessage({ id, designDir: job.designDir, sources: job.sources } satisfies CssJob);
	}

	return (designDir, sources) =>
		new Promise((resolve, reject) => hand({ designDir, sources, resolve, reject, timer: undefined }));
}

const daemonCssWorkers = createCssWorkers();

/**
 * The finished stylesheet for one frame document (#15): compileFrameCssHere,
 * run on one of the daemon's stylesheet workers so its event loop stays free
 * while Tailwind works. The sources are the bytes the frame's bundle was made
 * of, handed over rather than read again. The daemon's stylesheet runner.
 */
export const compileFrameCssOnWorker: StylesheetRunner = (designDir, sources) => daemonCssWorkers(designDir, sources);
