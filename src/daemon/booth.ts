import type { BrowserContext, CDPSession, ConsoleMessage, Page } from "playwright-core";
import { COVER_QUALITY, type ColorScheme, captureRasterSize, coverCaptureScale, SETTLE_BUDGET_MS } from "../cover";
import {
	fetchHeadlessShell,
	type HeadlessShell,
	launchHeadlessShell,
	MissingHeadlessShellError,
} from "../headless-shell";
import { pageParent } from "../page-path";
import { settleSource } from "./document";
import type { LogEntry } from "./verify-record";

/**
 * The photo booth: every frame cover is made here, in a headless browser the
 * daemon owns, and nowhere else (#107's one codepath). The canvas never
 * photographs a frame.
 *
 * A cover is the frame's own document, loaded top level from the render origin
 * in one of a few long-lived tabs, settled by the shim's own settle in an
 * isolated world, and taken with Chrome's own screenshot at the cover's size.
 * It is the frame's first screen in its default scenario, never a session
 * somebody left it in, and it goes through the same content-addressed store
 * and the same `thumb` event the canvas has always read, so an open canvas
 * picks it up unchanged.
 *
 * What feeds it is the change hub of every registered project, open in a
 * canvas or not, and any read that finds a frame with no cover. One queue, one
 * entry per frame, in this order: the frames on screen in an open canvas, then
 * the rest of the page it shows, then everything else. Within each, an edit
 * goes ahead of a picture that is merely missing, and a frame edited while a
 * tab is photographing it goes round once more when the tab is free, so a
 * storm of writes occupies one tab and never builds a backlog.
 *
 * `spool shot` and `spool logs` boot frames in the same browser, through the
 * same load and the same settle, ahead of any cover: an agent is waiting on
 * those.
 */

/**
 * How many frames are photographed at once. Measured on an M1 Pro over Spool's
 * own canvas of 754 frames: two tabs took 196 s, three 135 s, and four no less
 * than three. Past that the stages only get slower.
 */
export const BOOTH_TABS = 3;

/**
 * Covers a tab takes before it is swapped for a fresh one. A tab's renderer
 * grows across navigations, back/forward cache or not: one browser climbed from
 * 1.1 to 4.8 GB over five passes of a 200-frame page. A fresh page every twenty
 * holds a whole pass of Spool's canvas at 0.66 GB at the same speed.
 */
export const COVERS_PER_PAGE = 20;

/**
 * How much longer than its own budget the settle is waited on, from outside
 * the page. A frame whose main thread is too busy to run timers never fires
 * the settle's own cap (one took 15.5 s on a software GPU), so the booth's
 * patience has to live where the frame cannot hold it up.
 */
const SETTLE_GRACE_MS = 600;

/** How long a cover's document has to draw something into its root. */
const COVER_BOOT_MS = 5000;

/**
 * How long a shot waits for the root to have children (#16). A frame that
 * renders nothing still shoots, so running this out is not a failure.
 */
const SHOT_BOOT_MS = 10_000;

/** How long a navigation may take before the job gives up on it. */
const LOAD_MS = 15_000;

/** How long Chrome is given to draw the screenshot itself. */
const SCREENSHOT_MS = 10_000;

/** How long a document's fonts may keep a shot waiting (#18). */
const SHOT_FONTS_MS = 30_000;

/**
 * How long after a failed launch the booth tries again. A browser that could
 * not start a second ago will not start now, and every edit asking would make
 * the daemon a launch loop.
 */
const RELAUNCH_AFTER_MS = 60_000;

/**
 * How long a frame whose cover failed is left alone by reads that find it
 * uncovered. An edit always asks again: it is the thing that can fix it.
 */
const FAILED_COOLDOWN_MS = 60_000;

/** How long a browser gets to close before its process is ended outright. */
const CLOSE_MS = 5000;

/**
 * Why a frame owes a cover. An edit is fresh work somebody is likely watching
 * for; a stale picture (its colour scheme went out from under it) and a missing
 * one are the backlog. Only a missing picture is skipped when one has turned up
 * by the time a tab is free.
 */
export type BoothReason = "edited" | "stale" | "missing";

const REASON_RANK: Record<BoothReason, number> = { edited: 0, stale: 1, missing: 2 };

/** One frame of one registered project. */
export interface BoothFrame {
	root: string;
	/** The project's name, which is how a frame URL names it. */
	project: string;
	frame: string;
}

export interface BoothJob extends BoothFrame {
	reason: BoothReason;
}

/**
 * What one open canvas shows, reported at camera rest: the page it is on and
 * the frames inside its viewport. A frame on screen is one somebody is looking
 * at; the rest of that page is a pan away.
 */
export interface BoothView {
	root: string;
	page: string;
	frames: readonly string[];
}

/** Where a frame stands in the queue's order: on screen, on an open page, or neither. */
export type BoothPlace = 0 | 1 | 2;

const keyOf = (root: string, frame: string) => `${root}\0${frame}`;

/**
 * The booth's one queue, as a model with no browser in it. Entries are keyed
 * by frame, so a frame is waiting at most once whatever asks for it, and the
 * order is decided when a tab asks for work rather than when the work arrived:
 * a canvas that pans changes what is on screen, and the next frame taken has
 * to be one from where it came to rest.
 *
 * The order is where a frame is first (on screen, on an open page, neither),
 * then why it is owed (an edit, a stale picture, a missing one), then how long
 * it has waited. A missing picture on screen goes ahead of an edit nobody can
 * see, because the one somebody is looking at is the one worth having first.
 */
export function createBoothQueue() {
	interface Waiting extends BoothJob {
		seq: number;
	}
	const waiting = new Map<string, Waiting>();
	/** Frames in a tab now, each true once a change has landed behind the tab's back. */
	const inTab = new Map<string, { job: BoothJob; dirty: boolean }>();
	const views = new Map<string, { root: string; page: string; frames: ReadonlySet<string> }>();
	let seq = 0;

	function placeOf(root: string, frame: string): BoothPlace {
		let place: BoothPlace = 2;
		for (const view of views.values()) {
			if (view.root !== root) continue;
			if (view.frames.has(frame)) return 0;
			if (pageParent(frame) === view.page) place = 1;
		}
		return place;
	}

	function add(job: BoothJob): void {
		const key = keyOf(job.root, job.frame);
		const held = inTab.get(key);
		if (held !== undefined) {
			// the tab holding it is photographing what the frame was: a missing
			// picture is being made right now, anything else goes round again
			if (job.reason !== "missing") held.dirty = true;
			return;
		}
		const queued = waiting.get(key);
		if (queued === undefined) waiting.set(key, { ...job, seq: seq++ });
		else if (REASON_RANK[job.reason] < REASON_RANK[queued.reason]) queued.reason = job.reason;
	}

	/** The next frame for a free tab, which is now in it. */
	function take(): BoothJob | undefined {
		let best: Waiting | undefined;
		let bestPlace = 3;
		for (const entry of waiting.values()) {
			const place = placeOf(entry.root, entry.frame);
			if (
				best === undefined ||
				place < bestPlace ||
				(place === bestPlace &&
					(REASON_RANK[entry.reason] < REASON_RANK[best.reason] ||
						(entry.reason === best.reason && entry.seq < best.seq)))
			) {
				best = entry;
				bestPlace = place;
			}
		}
		if (best === undefined) return undefined;
		const key = keyOf(best.root, best.frame);
		waiting.delete(key);
		const job: BoothJob = { root: best.root, project: best.project, frame: best.frame, reason: best.reason };
		inTab.set(key, { job, dirty: false });
		return job;
	}

	/** The tab is free of this frame. One that changed while it was in there goes round again. */
	function release(job: BoothFrame): boolean {
		const key = keyOf(job.root, job.frame);
		const held = inTab.get(key);
		if (held === undefined) return false;
		inTab.delete(key);
		if (!held.dirty) return false;
		add({ ...held.job, reason: "edited" });
		return true;
	}

	/** The frame is gone: nothing is owed for it. */
	function drop(root: string, frame: string): void {
		const key = keyOf(root, frame);
		waiting.delete(key);
		const held = inTab.get(key);
		if (held !== undefined) held.dirty = false;
	}

	/** Everything owed for one project, which has left the registry. */
	function dropProject(root: string): void {
		for (const [key, entry] of waiting) if (entry.root === root) waiting.delete(key);
		for (const held of inTab.values()) if (held.job.root === root) held.dirty = false;
		for (const [id, view] of views) if (view.root === root) views.delete(id);
	}

	function view(id: string, next: BoothView | undefined): void {
		if (next === undefined) views.delete(id);
		else views.set(id, { root: next.root, page: next.page, frames: new Set(next.frames) });
	}

	return {
		add,
		take,
		release,
		drop,
		dropProject,
		view,
		placeOf,
		/** Frames waiting for a tab. */
		get waiting() {
			return waiting.size;
		},
		/** Frames in a tab right now. */
		get busy() {
			return inTab.size;
		},
	};
}

export type BoothQueue = ReturnType<typeof createBoothQueue>;

/**
 * Whether a frame's picture depends on the colour scheme it is shown in, read
 * off its compiled document: a `prefers-color-scheme` query in its stylesheets
 * (Tailwind's `dark:` compiles to one), a `color-scheme` there or in a meta tag
 * that lets the browser choose between light and dark, or code that asks
 * `matchMedia` for the scheme. Only the stylesheets are searched for the query
 * itself: a module that merely carries the words as data (Spool's own canvas
 * has one, in a list of Tailwind variants bundled into four hundred frames) is
 * not a frame that follows the scheme. A false positive costs one more picture
 * when the scheme changes; a frame that reads the scheme only through a
 * vendored package is the miss, and its next edit corrects it.
 */
export function followsColorScheme(document: string): boolean {
	const styles = [...document.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
		.map((match) => match[1] ?? "")
		.join("\n");
	return (
		styles.includes("prefers-color-scheme") ||
		BOTH_SCHEMES.test(styles) ||
		/matchMedia\(\s*["'`][^"'`]*prefers-color-scheme/.test(document) ||
		/<meta[^>]*color-scheme[^>]*content=["'][^"']*(?:light[^"']*dark|dark[^"']*light)/i.test(document)
	);
}

/** A `color-scheme` naming both, in either order. */
const BOTH_SCHEMES =
	/color-scheme\s*:[^;}"'<]*\blight\b[^;}"'<]*\bdark\b|color-scheme\s*:[^;}"'<]*\bdark\b[^;}"'<]*\blight\b/i;

export type BoothCompile = { kind: "ok"; document: string } | { kind: "error"; message: string } | { kind: "missing" };

export interface BoothDeps {
	/** The render origin, once the daemon is really listening. */
	origin(): string | undefined;
	/** The frame's document, compiled through the cache the page load then hits. */
	compile(root: string, frame: string): Promise<BoothCompile>;
	geometry(root: string, frame: string): { w: number; h: number };
	/** Whether the frame has a cover now, for a missing picture that may have turned up. */
	covered(root: string, frame: string): boolean;
	/** A cover landed: the bytes, and the scheme it depends on when it depends on one. */
	store(root: string, frame: string, bytes: Buffer, scheme: ColorScheme | undefined): void;
	/** A cover could not be made; the reason rides beside the old one, which stays (#173). */
	failed(root: string, frame: string, reason: string): void;
	/** A job for this frame is over, whatever came of it. */
	finished?(root: string, frame: string): void;
	/** The browser; tests hand in their own. */
	launch?(): Promise<HeadlessShell>;
	/** The first-run fetch of the pinned shell; tests hand in their own. */
	fetch?(): Promise<void>;
	/** Something worth a line in the daemon's log. */
	log?(line: string): void;
}

/** What `spool shot` and `spool logs` ask of one boot (#25). */
export interface ShotRequest {
	project: string;
	frame: string;
	/** CSS pixels: an explicit viewport, the sidecar's footprint, or the default. */
	width: number;
	height: number;
	/** Device scale, picked for a vision model (`planShot`). */
	scale: number;
	/** Top-to-bottom slices in CSS pixels; one when the frame fits a single image. */
	tiles: ReadonlyArray<{ y: number; height: number }>;
	/** A fixed wait after the first commit instead of the settle. */
	at?: number | undefined;
	scenario?: string | undefined;
}

export type ShotResult =
	| { kind: "booted"; pngs: Buffer[]; entries: LogEntry[]; errors: string[]; contentHeight: number }
	/** The document failed to serve after the compile probe passed: the source broke in between. */
	| { kind: "unserved"; status: number };

interface PendingShot {
	request: ShotRequest;
	narrate: (line: string) => void;
	resolve: (result: ShotResult) => void;
	reject: (error: Error) => void;
}

interface Tab {
	page: Page;
	cdp: CDPSession;
	/** Covers taken on this page, for COVERS_PER_PAGE. */
	covers: number;
	/** The scheme this page was last asked to emulate. */
	scheme: ColorScheme | undefined;
	errors: string[];
	entries: LogEntry[];
}

interface Running {
	shell: Promise<HeadlessShell>;
	context: Promise<BrowserContext> | undefined;
}

/** A wait the booth enforces from outside the page ran out. */
class TimedOut extends Error {}

/** A browser that would not start, as against a frame that would not draw. */
class LaunchFailure extends Error {}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	return Promise.race([
		promise,
		new Promise<never>((_, fail) => {
			timer = setTimeout(() => fail(new TimedOut(what)), ms);
		}),
	]).finally(() => clearTimeout(timer));
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const FETCHING_LINE = "first shot on this machine — fetching the pinned Chromium headless-shell (one-time, ~90 MB)";
const FETCHED_LINE = "headless-shell ready — cached for every future shot";

/** The booth itself: one queue, one browser while there is work, BOOTH_TABS tabs in it. */
export function createBooth(deps: BoothDeps) {
	const queue = createBoothQueue();
	const shots: PendingShot[] = [];
	/** Shots in a tab, which hear about a fetch as much as the ones waiting do. */
	const shooting = new Set<PendingShot>();
	const failedAt = new Map<string, number>();
	const launch = deps.launch ?? launchHeadlessShell;
	const fetchShell = deps.fetch ?? fetchHeadlessShell;
	const log = deps.log ?? ((line: string) => console.error(`spool: ${line}`));
	const tabs = new Map<number, Tab>();
	const slots = new Set<number>();
	let running: Running | undefined;
	let fetching: Promise<void> | undefined;
	let blockedUntil = 0;
	let unblock: NodeJS.Timeout | undefined;
	let scheme: ColorScheme = "light";
	let closed = false;
	/** Workers in the middle of a job, as against ones about to look for the next. */
	let occupied = 0;

	function enqueue(job: BoothJob): void {
		if (closed) return;
		const failed = failedAt.get(keyOf(job.root, job.frame));
		if (job.reason === "missing" && failed !== undefined && failed + FAILED_COOLDOWN_MS > Date.now()) return;
		queue.add(job);
		pump();
	}

	function shoot(request: ShotRequest, narrate: (line: string) => void = () => {}): Promise<ShotResult> {
		if (closed) return Promise.reject(new Error("the daemon is shutting down"));
		return new Promise((resolve, reject) => {
			shots.push({ request, narrate, resolve, reject });
			if (fetching !== undefined) narrate(FETCHING_LINE);
			pump();
		});
	}

	/** Hand free tabs their work, launching the browser on the first. */
	function pump(): void {
		if (closed) return;
		const coversAllowed = Date.now() >= blockedUntil;
		const waiting = () => shots.length + (coversAllowed ? queue.waiting : 0);
		// a worker between jobs takes the next one itself; one starts only for
		// work nobody alive is about to pick up
		while (slots.size < BOOTH_TABS && slots.size - occupied < waiting()) {
			let slot = 0;
			while (slots.has(slot)) slot++;
			slots.add(slot);
			void work(slot).finally(() => {
				slots.delete(slot);
				settleIfIdle();
			});
		}
		if (!coversAllowed && queue.waiting > 0 && unblock === undefined) {
			unblock = setTimeout(() => {
				unblock = undefined;
				pump();
			}, blockedUntil - Date.now());
			unblock.unref?.();
		}
	}

	/**
	 * The last worker is done. Work that arrived as it left starts another;
	 * otherwise the queue has drained and the browser closes, taking every byte
	 * it held with it. A relaunch costs 0.1 to 0.3 s.
	 */
	function settleIfIdle(): void {
		if (slots.size > 0 || closed) return;
		if (shots.length > 0 || (queue.waiting > 0 && Date.now() >= blockedUntil)) {
			pump();
			return;
		}
		const held = running;
		running = undefined;
		tabs.clear();
		if (held !== undefined) void shut(held);
	}

	async function shut(held: Running): Promise<void> {
		let shell: HeadlessShell;
		try {
			shell = await held.shell;
		} catch {
			return;
		}
		try {
			await within(shell.close(), CLOSE_MS, "close");
		} catch {
			// a close that never returns (seen on M1 Macs) must not keep the memory
			// it was meant to free
			await shell.kill().catch(() => {});
		}
	}

	function browserNow(): Running {
		if (running !== undefined) return running;
		const next: Running = { shell: start(), context: undefined };
		running = next;
		const forget = () => {
			if (running !== next) return;
			running = undefined;
			tabs.clear();
		};
		next.shell.then((shell) => {
			// a browser that died (its GPU process took it down, someone killed it)
			// is relaunched by the next job rather than asked for tabs forever
			shell.browser.on("disconnected", forget);
		}, forget);
		return next;
	}

	async function start(): Promise<HeadlessShell> {
		try {
			return await launch();
		} catch (error) {
			if (!(error instanceof MissingHeadlessShellError)) throw error;
		}
		// The first picture on this machine: the shell is fetched once, beside
		// the event loop rather than on it, and every frame shows its
		// placeholder until it lands.
		fetching ??= (async () => {
			for (const pending of [...shots, ...shooting]) pending.narrate(FETCHING_LINE);
			log(FETCHING_LINE);
			try {
				await fetchShell();
				for (const pending of [...shots, ...shooting]) pending.narrate(FETCHED_LINE);
				log(FETCHED_LINE);
			} finally {
				fetching = undefined;
			}
		})();
		await fetching;
		return await launch();
	}

	async function tabFor(slot: number): Promise<Tab> {
		const held = tabs.get(slot);
		if (held !== undefined && held.covers < COVERS_PER_PAGE && !held.page.isClosed()) return held;
		if (held !== undefined) retire(slot, held);
		try {
			const live = browserNow();
			const shell = await live.shell;
			live.context ??= shell.browser.newContext({ viewport: null });
			const context = await live.context;
			const page = await context.newPage();
			const cdp = await context.newCDPSession(page);
			const tab: Tab = { page, cdp, covers: 0, scheme: undefined, errors: [], entries: [] };
			page.on("pageerror", (error) => {
				const text = String(error);
				tab.errors.push(text);
				tab.entries.push({ type: "pageerror", text });
			});
			tabs.set(slot, tab);
			return tab;
		} catch (error) {
			throw new LaunchFailure(describe(error));
		}
	}

	/** One tab's turn: shots first, then the queue in its order, until nothing is left for it. */
	async function work(slot: number): Promise<void> {
		for (;;) {
			if (closed) return;
			const shot = shots.shift();
			if (shot !== undefined) {
				occupied++;
				shooting.add(shot);
				try {
					shot.resolve(await runShot(slot, shot));
				} catch (error) {
					shot.reject(error instanceof Error ? error : new Error(String(error)));
					if (error instanceof LaunchFailure) return;
				} finally {
					shooting.delete(shot);
					occupied--;
				}
				continue;
			}
			if (Date.now() < blockedUntil) return;
			const job = queue.take();
			if (job === undefined) return;
			occupied++;
			try {
				await runCover(slot, job);
			} catch (error) {
				// a daemon shutting down took the browser out from under the job
				if (closed) return;
				if (error instanceof LaunchFailure) {
					// not the frame's fault: it waits for a browser that starts
					queue.release(job);
					queue.add(job);
					blockedUntil = Date.now() + RELAUNCH_AFTER_MS;
					log(`the photo booth could not start a browser: ${error.message}`);
					return;
				}
				// a frame whose folder went strange under it (a design boundary, a
				// vanished project) is that frame's problem, never the booth's
				log(`could not make a cover for "${job.frame}": ${describe(error)}`);
			} finally {
				occupied--;
				if (queue.release(job)) pump();
				deps.finished?.(job.root, job.frame);
			}
		}
	}

	async function runCover(slot: number, job: BoothJob): Promise<void> {
		const key = keyOf(job.root, job.frame);
		if (job.reason === "missing" && deps.covered(job.root, job.frame)) return;
		const origin = deps.origin();
		if (origin === undefined) return;
		const compiled = await deps.compile(job.root, job.frame);
		if (compiled.kind === "missing") return;
		const fail = (reason: string) => {
			failedAt.set(key, Date.now());
			deps.failed(job.root, job.frame, reason.slice(0, 240));
		};
		// a broken compile keeps the last good picture; the reason rides beside it
		if (compiled.kind === "error") return fail(compiled.message);
		const { w, h } = deps.geometry(job.root, job.frame);
		const width = Math.max(1, Math.round(w));
		const height = Math.max(1, Math.round(h));
		const scale = coverCaptureScale(width);
		if (captureRasterSize(width, height, scale) === undefined) return fail("too large for a cover");
		const sensitive = followsColorScheme(compiled.document);
		const tab = await tabFor(slot);
		tab.covers++;
		try {
			// the scheme this picture is taken in, which a change of the canvas's while
			// it is in the tab does not rewrite: that change sends it round again
			const taken = await prepare(tab, { width, height, scale });
			const url = `${origin}/p/${encodeURIComponent(job.project)}/frames/${encodeURIComponent(job.frame)}`;
			await within(tab.page.goto(url, { waitUntil: "domcontentloaded", timeout: LOAD_MS }), LOAD_MS, "load");
			const world = await isolatedWorld(tab);
			const rendered = await booted(tab, world, COVER_BOOT_MS, true);
			if (!rendered && tab.errors.length > 0) return fail(`threw on boot: ${tab.errors[0]}`);
			await settled(tab, world);
			const bytes = await screenshot(tab, {
				format: "jpeg",
				quality: Math.round(COVER_QUALITY * 100),
				optimizeForSpeed: true,
				clip: { x: 0, y: 0, width, height, scale: 1 },
			});
			failedAt.delete(key);
			deps.store(job.root, job.frame, bytes, sensitive ? taken : undefined);
		} catch (error) {
			// a page that would not load or draw is not one to load the next frame into
			retire(slot, tab);
			// a daemon shutting down is not something the frame did
			if (closed) return;
			fail(error instanceof TimedOut ? `the frame did not finish its ${error.message} in time` : describe(error));
		}
	}

	async function runShot(slot: number, shot: PendingShot): Promise<ShotResult> {
		const origin = deps.origin();
		if (origin === undefined) throw new Error("the daemon is not listening yet");
		const { request } = shot;
		const tab = await tabFor(slot);
		// the console is a shot's to keep, and only a shot's: a frame logging every
		// tick would otherwise cost every cover the serialization of every line
		const onConsole = (message: ConsoleMessage) => tab.entries.push({ type: message.type(), text: message.text() });
		tab.page.on("console", onConsole);
		try {
			await prepare(tab, { width: request.width, height: request.height, scale: request.scale });
			const query = request.scenario === undefined ? "" : `?scenario=${encodeURIComponent(request.scenario)}`;
			const url = `${origin}/p/${encodeURIComponent(request.project)}/frames/${encodeURIComponent(request.frame)}${query}`;
			const response = await within(
				tab.page.goto(url, { waitUntil: "domcontentloaded", timeout: LOAD_MS }),
				LOAD_MS,
				"load",
			);
			if (response !== null && response.status() >= 500) return { kind: "unserved", status: response.status() };
			const world = await isolatedWorld(tab);
			// frames are blank until React commits (#16); one that renders nothing
			// is legitimate, so running this out still shoots what is there
			await booted(tab, world, SHOT_BOOT_MS, false);
			if (request.at === undefined) await settled(tab, world);
			else await pause(request.at);
			await within(evaluate(tab, world, "document.fonts.ready.then(() => true)"), SHOT_FONTS_MS, "fonts").catch(
				() => {},
			);
			const contentHeight = Number(await evaluate(tab, world, "document.documentElement.scrollHeight")) || 0;
			const pngs: Buffer[] = [];
			for (const tile of request.tiles) {
				pngs.push(
					await screenshot(tab, {
						format: "png",
						clip: { x: 0, y: tile.y, width: request.width, height: tile.height, scale: 1 },
					}),
				);
			}
			return { kind: "booted", pngs, entries: [...tab.entries], errors: [...tab.errors], contentHeight };
		} catch (error) {
			retire(slot, tab);
			throw error instanceof TimedOut ? new Error(`the frame did not finish its ${error.message} in time`) : error;
		} finally {
			tab.page.off("console", onConsole);
		}
	}

	/** A tab that failed a job, or has taken its share, is closed rather than trusted with the next. */
	function retire(slot: number, tab: Tab): void {
		if (tabs.get(slot) === tab) tabs.delete(slot);
		void tab.page.close().catch(() => {});
	}

	/** Metrics, scheme and a clean slate for the next document in this tab. */
	async function prepare(tab: Tab, metrics: { width: number; height: number; scale: number }): Promise<ColorScheme> {
		const wanted = scheme;
		tab.errors.length = 0;
		tab.entries.length = 0;
		await tab.cdp.send("Emulation.setDeviceMetricsOverride", {
			width: metrics.width,
			height: metrics.height,
			deviceScaleFactor: metrics.scale,
			mobile: false,
		});
		if (tab.scheme !== wanted) {
			// through playwright rather than a CDP session of the booth's own:
			// playwright holds the page's media emulation, light unless told, and
			// would put it back over a value set behind its back
			await tab.page.emulateMedia({ colorScheme: wanted });
			tab.scheme = wanted;
		}
		return wanted;
	}

	/** The frame has drawn something into its root, or the budget ran out, or (for a cover) it threw. */
	async function booted(tab: Tab, world: number, budgetMs: number, stopOnError: boolean): Promise<boolean> {
		const deadline = performance.now() + budgetMs;
		let erroredAt: number | undefined;
		while (performance.now() < deadline) {
			if ((await evaluate(tab, world, "(document.getElementById('root')?.childElementCount ?? 0) > 0")) === true) {
				return true;
			}
			if (stopOnError && tab.errors.length > 0) {
				erroredAt ??= performance.now();
				// a throw is final once the tree has had a beat to commit anyway
				if (performance.now() - erroredAt > 150) return false;
			}
			await pause(16);
		}
		return false;
	}

	/**
	 * The shim's own settle, run where frame code cannot reach it, and waited on
	 * from outside the page for no longer than its budget and a grace.
	 */
	async function settled(tab: Tab, world: number): Promise<void> {
		await within(
			evaluate(tab, world, `(${settleSource("requestAnimationFrame")})(${SETTLE_BUDGET_MS})`),
			SETTLE_BUDGET_MS + SETTLE_GRACE_MS,
			"settle",
		).catch((error: unknown) => {
			if (!(error instanceof TimedOut)) throw error;
		});
	}

	async function screenshot(tab: Tab, params: Record<string, unknown>): Promise<Buffer> {
		const shot = (await within(tab.cdp.send("Page.captureScreenshot", params), SCREENSHOT_MS, "drawing")) as {
			data: string;
		};
		return Buffer.from(shot.data, "base64");
	}

	/** A world of the booth's own in the document now loaded, where every global is native. */
	async function isolatedWorld(tab: Tab): Promise<number> {
		const { frameTree } = (await tab.cdp.send("Page.getFrameTree")) as { frameTree: { frame: { id: string } } };
		const { executionContextId } = (await tab.cdp.send("Page.createIsolatedWorld", {
			frameId: frameTree.frame.id,
			worldName: "spool-booth",
		})) as { executionContextId: number };
		return executionContextId;
	}

	async function evaluate(tab: Tab, contextId: number, expression: string): Promise<unknown> {
		const evaluated = (await tab.cdp.send("Runtime.evaluate", {
			expression,
			contextId,
			awaitPromise: true,
			returnByValue: true,
		})) as { result: { value?: unknown } };
		return evaluated.result.value;
	}

	return {
		enqueue,
		shoot,
		/** What one open canvas shows, or nothing once it has gone. */
		view: (id: string, next: BoothView | undefined) => queue.view(id, next),
		placeOf: (root: string, frame: string) => queue.placeOf(root, frame),
		/** A frame left the project. */
		drop: (root: string, frame: string) => queue.drop(root, frame),
		/** A project left the registry. */
		dropProject: (root: string) => queue.dropProject(root),
		/** The scheme covers render in. True when it changed, so the covers it made stale can be asked for. */
		setScheme(next: ColorScheme): boolean {
			if (next === scheme) return false;
			scheme = next;
			return true;
		},
		get scheme(): ColorScheme {
			return scheme;
		},
		async close(): Promise<void> {
			closed = true;
			if (unblock !== undefined) clearTimeout(unblock);
			for (const pending of shots.splice(0)) pending.reject(new Error("the daemon is shutting down"));
			const held = running;
			running = undefined;
			tabs.clear();
			if (held !== undefined) await shut(held);
		},
	};
}

export type Booth = ReturnType<typeof createBooth>;

function describe(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
}
