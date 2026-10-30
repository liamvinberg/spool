import { execFile } from "node:child_process";
import type { BrowserContext, CDPSession, ConsoleMessage, Disposable, Page } from "playwright-core";
import { COVER_QUALITY, type ColorScheme, type CoverShape, coverShape, SETTLE_BUDGET_MS } from "../cover";
import {
	fetchHeadlessShell,
	type HeadlessShell,
	HeadlessShellCannotRunError,
	launchHeadlessShell,
	MissingHeadlessShellError,
} from "../headless-shell";
import type { NamedElement } from "../runtime/frame-shim/named-element";
import { type BoothQueue, type BoothReason, keyOf, type Sitting } from "./booth-queue";
import { frameShims } from "./frame-shims";
import { type FramePace, SLOW_PER_SECOND } from "./thumbs";
import { VENDOR_REACT_URL } from "./vendor-pins";
import type { LogEntry } from "./verify-record";

export { type BoothReason, createBoothQueue, type Sitting } from "./booth-queue";

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
 * One frame in a tab, from its load to its stored picture, is a sitting. What
 * asks for one is the change hub of every registered project, open in a canvas
 * or not, and any read that finds a frame with no cover. One queue, one entry
 * per frame, in this order: the frames on screen in an open canvas, then the
 * rest of the page it shows, then everything else. Within each, an edit goes
 * ahead of a picture that is merely missing, and a frame edited while a tab is
 * photographing it sits again when the tab is free, so a storm of writes
 * occupies one tab and never builds a backlog.
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
const BOOTH_TABS = 3;

/**
 * Covers a tab takes before it is swapped for a fresh page. A tab's renderer
 * grows across navigations, back/forward cache or not: one browser climbed from
 * 1.1 to 4.8 GB over five passes of a 200-frame page. Over a pass of Spool's
 * canvas a fresh page every ten kept the browser at a median of 0.78 GB where
 * every twenty kept it at 0.94 to 1.06 GB, for a pass at most 5% longer. The
 * peaks are the heaviest frames themselves either way.
 */
const COVERS_PER_PAGE = 10;

/**
 * How long the browser outlives the last sitting, its tabs parked on an empty
 * page. An agent edits a frame, looks, and edits again a few seconds later, and
 * each of those is one sitting with nothing queued behind it: closing on every
 * drain made each one relaunch the browser first, about 0.2 s of the half
 * second an edit took to reach the canvas. Kept, the browser holds its few
 * hundred megabytes for this long after a burst and then frees all of it.
 */
const LINGER_MS = 30_000;

/**
 * How long a whole sitting may take, from load to screenshot, enforced from
 * the daemon. A frame whose main thread never comes back (a loop, a script
 * stuck in its own work) never answers anything the booth asks it, its own
 * settle's cap included, so the booth's patience has to live outside the page:
 * past this the tab is closed out from under the frame, its old cover stays,
 * and the reason is written beside it.
 */
const SITTING_MS = 20_000;

/**
 * The same for a shot, before any fixed wait `--at` asks for: a boot's own
 * wait for content, its settle, its fonts and every slice.
 */
const SHOT_MS = 45_000;

/**
 * How much longer than its own budget the settle is waited on before the
 * picture is taken anyway. A frame too busy to run timers never fires the
 * settle's own cap (one took 15.5 s on a software GPU).
 */
const SETTLE_GRACE_MS = 600;

/**
 * The pixel density a frame's redraws are timed at, after its cover. A cover
 * is laid out at a fraction of a pixel per pixel, and a frame that draws its
 * own pixels (a canvas, a shader) costs what its pixels cost: a 2D canvas
 * redrawing a few hundred clipped gradients every frame kept up with the
 * display at cover density and drew 8 frames a second at this one, which is the density a Retina canvas runs it at.
 */
const PACE_SCALE = 2;
/** The most pixels a frame is timed over, a 1920 x 1200 frame at `PACE_SCALE`. */
const PACE_PIXELS = 1920 * 1200 * PACE_SCALE ** 2;
/** How long after the density changes the timing starts, for the frame's own resize. */
const PACE_WARM_MS = 200;
/** The longest a frame's redraws are timed for. */
const PACE_WINDOW_MS = 600;
/** Redraws enough to call a frame's pace, so one that keeps up is timed briefly. */
const PACE_FRAMES = 20;
/**
 * The most a timing may take, its resize included, before the tab is given up
 * on and the frame is taken to be as slow as a frame gets.
 */
const PACE_DEADLINE_MS = 3000;

/** How long a cover's document has to draw something into its root. */
const COVER_BOOT_MS = 5000;

/**
 * How long a shot waits for the root to have children (#16). A frame that
 * renders nothing still shoots, so running this out is not a failure.
 */
const SHOT_BOOT_MS = 10_000;

/**
 * How far a stopped clock runs at a time, during a shot's boot and its seek:
 * one display frame, so each step runs at most one animation frame.
 */
const SEEK_STEP_MS = 16;

/** How long a shot's boot waits on a stopped clock before running it, for a frame whose first render waits on a timer. */
const STEP_AFTER_MS = 1000;

/** How long a seek leaves for what its last step scheduled on real time, a React render, before the picture. */
const SEEK_FLUSH_MS = 50;

/**
 * The marker a shot's watch says its findings with: a frame never logs it, so
 * the console line is spool's own.
 */
const WATCH_MARK = "\u2063spool\u2063";

/**
 * What a shot watches the frame for, ahead of its document: a WebGL context
 * lost, and WebGL drawn in software, either of which leaves a canvas black or
 * stale with nothing in the console. Each is said once, as a console line
 * carrying WATCH_MARK, read back as a "spool" entry.
 */
const WATCH_SOURCE = `(() => {
	// React's development build asks for its DevTools on every boot otherwise
	globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ ??= { isDisabled: true };
	const warn = console.warn.bind(console);
	const said = new Set();
	const say = (text) => { if (!said.has(text)) { said.add(text); warn(${JSON.stringify(WATCH_MARK)} + text); } };
	addEventListener("webglcontextlost", () => say("WebGL context lost: the canvas shows nothing it drew after this"), true);
	const software = (gl) => {
		try {
			const info = gl.getExtension("WEBGL_debug_renderer_info");
			const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
			if (/swiftshader|llvmpipe|softpipe|software/i.test(renderer)) {
				say("WebGL renders in software here (" + renderer + "): heavy shaders run slowly, and a black canvas may be this browser's limit rather than the frame's");
			}
		} catch {}
	};
	for (const Canvas of [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]) {
		if (Canvas === undefined) continue;
		const getContext = Canvas.prototype.getContext;
		Canvas.prototype.getContext = function (type, ...rest) {
			const context = getContext.call(this, type, ...rest);
			if (context !== null && /webgl/.test(String(type))) software(context);
			return context;
		};
	}
})();`;

/**
 * A console line as the browser's own console prints it: a first argument
 * with %s, %d, %o or %c in it takes the arguments after it in their place,
 * which React's development build relies on for every warning it says.
 */
export function formatConsole(args: readonly string[], fallback: string): string {
	const [format, ...rest] = args;
	if (format === undefined || !/%[sdifoOc]/.test(format)) return fallback;
	let next = 0;
	const text = format.replace(/%([sdifoOc%])/g, (whole, kind: string) => {
		if (kind === "%") return "%";
		if (next >= rest.length) return whole;
		const value = rest[next++] ?? "";
		return kind === "c" ? "" : value;
	});
	return [text, ...rest.slice(next)].join(" ").trimEnd();
}

function consoleText(message: ConsoleMessage): string {
	// a handle's preview is its value for a string or a number, which is all a format takes
	return formatConsole(
		message.args().map((arg) => arg.toString()),
		message.text(),
	);
}

/** How long a document's fonts may keep a shot waiting (#18). */
const SHOT_FONTS_MS = 15_000;

/**
 * How long a browser already on disk may take to start. A cold start is a
 * second or two; one that has not answered in this long is not starting, and a
 * shot waiting on it hears so in plain words instead of waiting with it. The
 * first-run fetch is not under it: that has its own narration.
 */
const LAUNCH_MS = 30_000;

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

/**
 * How long the browser gets to answer anything the booth asks of it, a close
 * included, before its process is ended outright.
 */
const ANSWER_MS = 5000;

/**
 * Browsers lost in a row, with no cover landed between, before the booth stops
 * relaunching for a while. One lost browser is a crash or a kill, and every
 * frame that was in it sits again in the next; three is a machine that cannot
 * keep one running.
 */
const LOST_IN_A_ROW = 3;

/** The waits a test needs short; every one of them is the constant above in the daemon. */
interface BoothTiming {
	launchMs: number;
	sittingMs: number;
	shotMs: number;
	relaunchAfterMs: number;
	lingerMs: number;
}

/**
 * Whether a frame's picture depends on the colour scheme it is shown in, read
 * off its served document: a `prefers-color-scheme` query in its stylesheets
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

/**
 * The colour scheme this machine is in, for the booth to start in before any
 * canvas has said which it shows: a frame on a canvas follows the browser's own
 * preference, and a browser follows the machine. macOS says so through its
 * global defaults; anywhere else the booth starts light, which is what a
 * headless browser renders when nobody says.
 */
export function systemColorScheme(platform: NodeJS.Platform = process.platform): Promise<ColorScheme> {
	if (platform !== "darwin") return Promise.resolve("light");
	return new Promise((done) => {
		execFile("defaults", ["read", "-g", "AppleInterfaceStyle"], { timeout: 2000 }, (error, stdout) => {
			done(error === null && stdout.trim() === "Dark" ? "dark" : "light");
		});
	});
}

/** The frame's document as the daemon compiles it now. */
type BoothCompile =
	| { kind: "ok"; etag: string; document: string; source?: string }
	| { kind: "error"; message: string }
	| { kind: "missing" };

export interface BoothDeps {
	/** The render origin, once the daemon is really listening. */
	origin(): string | undefined;
	/**
	 * The frame's document as it stands, with the etag that names the source it
	 * was built from, or the compile's error, or nothing when the frame is gone.
	 */
	compile(root: string, frame: string): Promise<BoothCompile>;
	geometry(root: string, frame: string): { w: number; h: number };
	/** Whether the frame has a cover now, for a missing picture that may have turned up. */
	covered(root: string, frame: string): boolean;
	/**
	 * Whether the project is still one the daemon keeps. A sitting is only ever
	 * owed again for one that is: a project that left, or moved and left its name
	 * to another folder, would otherwise be photographed against a document that
	 * is no longer its own, and owed again, forever.
	 */
	registered(root: string): boolean;
	/**
	 * A cover landed: the bytes, the scheme it depends on when it depends on one,
	 * and the version of the frame it is of (`CompiledFrameDocument.source`).
	 */
	store(root: string, frame: string, bytes: Buffer, scheme: ColorScheme | undefined, source?: string): void;
	/**
	 * How fast an edited frame redraws, timed after its cover landed, or nothing
	 * when it could not be timed: what `spool check` tells an agent of a frame
	 * heavy enough to slow a canvas.
	 */
	paced?(root: string, frame: string, pace: FramePace | undefined): void;
	/** A cover could not be made; the reason rides beside the old one, which stays (#173). */
	failed(root: string, frame: string, reason: string): void;
	/** A sitting for this frame is over, whatever came of it. */
	finished?(root: string, frame: string): void;
	/**
	 * React's development build, which a shot or logs boot loads in place of the
	 * pinned production one so its errors arrive in words. Covers keep production.
	 */
	reactDev?(): Promise<string>;
	/** The browser; tests hand in their own. */
	launch?(): Promise<HeadlessShell>;
	/** The first-run fetch of the pinned shell; tests hand in their own. */
	fetch?(): Promise<void>;
	/** The scheme to start in until a canvas says; tests hand in their own. */
	systemScheme?(): Promise<ColorScheme>;
	/** Something worth a line in the daemon's log. */
	log?(line: string): void;
	timing?: Partial<BoothTiming>;
}

/** What a test sets for itself: the browser, the scheme the booth starts in, and its waits. */
export type BoothSeams = Pick<BoothDeps, "launch" | "fetch" | "systemScheme" | "timing">;

/** What `spool shot` and `spool logs` ask of one boot (#25). */
interface ShotRequest {
	project: string;
	frame: string;
	/** CSS pixels: an explicit viewport, the sidecar's footprint, or the default. */
	width: number;
	height: number;
	/** Device scale, picked for a vision model (`planShot`). */
	scale: number;
	/** Top-to-bottom slices in CSS pixels; one when the frame fits a single image. */
	tiles: ReadonlyArray<{ y: number; height: number }>;
	/**
	 * Fixed times after the first commit, ascending, in place of the settle: the
	 * frame's own clock is run to each (`seek`) and the slices taken there, in
	 * one boot.
	 */
	at?: readonly number[] | undefined;
	/** CSS px to scroll the document down once it commits, ahead of the settle or the first seek. */
	scroll?: number | undefined;
	scenario?: string | undefined;
	/**
	 * An element to find once the frame settles, by a CSS selector or a `path:line` element pointer
	 * (`spool comments add --element`): the result says where it is and what the selection calls it.
	 */
	find?: string | undefined;
}

type ShotResult =
	| {
			kind: "booted";
			/** The slices, top to bottom, once per time asked for (once after the settle when none was). */
			shots: Array<{ at?: number; pngs: Buffer[] }>;
			entries: LogEntry[];
			errors: string[];
			contentHeight: number;
			scheme: ColorScheme;
			/** The element `find` named, or null when nothing in the frame matches it; absent when none was asked. */
			found?: NamedElement | null;
	  }
	/** The document failed to serve after the compile probe passed: the source broke in between. */
	| { kind: "unserved"; status: number };

interface PendingShot {
	request: ShotRequest;
	narrate: (line: string) => void;
	resolve: (result: ShotResult) => void;
	reject: (error: Error) => void;
}

interface Running {
	shell: Promise<HeadlessShell>;
	context: Promise<BrowserContext> | undefined;
	/** A session on the browser itself, which closes a tab whose renderer will not answer. */
	control: Promise<CDPSession> | undefined;
	/** The browser is closing, or went away: nothing more is asked of it. */
	ended: Promise<void> | undefined;
}

interface Tab {
	live: Running;
	page: Page;
	cdp: CDPSession;
	/** The tab as the browser names it, for closing it without its renderer. */
	targetId: string;
	/** Covers taken on this page, for COVERS_PER_PAGE. */
	covers: number;
	/** The scheme this page was last asked to emulate. */
	scheme: ColorScheme | undefined;
	errors: string[];
	entries: LogEntry[];
	/** Going back to an empty page after a drain; the next sitting waits on it. */
	parking: Promise<unknown> | undefined;
	/** The context of its own a tab outside every slot is in, closed with it. */
	alone: BrowserContext | undefined;
}

/** What one sitting saw. */
type Shot =
	| { kind: "picture"; bytes: Buffer; etag: string | undefined; scheme: ColorScheme }
	/** The document answered with something other than itself. */
	| { kind: "answered"; status: number }
	/** It threw before it drew anything. */
	| { kind: "threw"; message: string };

/** A wait the booth enforces from outside the page ran out. */
class TimedOut extends Error {
	constructor(
		readonly what: string,
		readonly ms: number,
	) {
		super(`the frame did not finish ${what} within ${Math.round(ms / 1000)} s`);
	}
}

/**
 * A browser that would not start, as against a frame that would not draw.
 * `cannotRun` is a machine that cannot run it at all until something is
 * installed, where waiting a minute changes nothing.
 */
class LaunchFailure extends Error {
	constructor(
		message: string,
		readonly cannotRun = false,
	) {
		super(message);
	}
}

/** The browser went away under a sitting: the frame did nothing wrong. */
class BrowserLost extends Error {
	constructor() {
		super("the browser went away");
	}
}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	return Promise.race([
		promise,
		new Promise<never>((_, fail) => {
			timer = setTimeout(() => fail(new TimedOut(what, ms)), ms);
		}),
	]).finally(() => clearTimeout(timer));
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** A pixel density as a pace records it. */
const rounded = (scale: number) => Math.round(scale * 100) / 100;

/**
 * Counts the document's display frames, run in the booth's own world. A frame
 * whose drawing keeps the renderer or the GPU busy holds every display frame
 * back, its own and this counter's alike. The first few after the density
 * changed are the frame redrawing for its new size, not its pace.
 */
const paceSource = `(warmMs, windowMs, enough) => new Promise((done) => {
	const began = performance.now();
	let ticks = 0;
	let start = 0;
	let last = 0;
	let counted = 0;
	let slowest = 0;
	const tick = () => {
		const now = performance.now();
		ticks++;
		if (ticks <= 3 || now - began < warmMs) {
			start = last = now;
			requestAnimationFrame(tick);
			return;
		}
		slowest = Math.max(slowest, now - last);
		last = now;
		counted++;
		if (counted < enough && now - start < windowMs) {
			requestAnimationFrame(tick);
			return;
		}
		done({ perSecond: Math.round((counted * 1000) / (now - start)), slowestMs: Math.round(slowest) });
	};
	requestAnimationFrame(tick);
})`;

/** A frame's document on the render origin, top level, as the canvas's iframe loads it. */
function frameUrl(origin: string, project: string, frame: string, scenario?: string): string {
	const query = scenario === undefined ? "" : `?scenario=${encodeURIComponent(scenario)}`;
	return `${origin}/p/${encodeURIComponent(project)}/frames/${encodeURIComponent(frame)}${query}`;
}

/** The one line a failed picture or shot is explained by. */
function describe(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
}

const FETCHING_LINE = "first shot on this machine — fetching the pinned Chromium headless-shell (one-time, ~90 MB)";
const FETCHED_LINE = "headless-shell ready — cached for every future shot";

/**
 * The booth itself: the queue it is handed, one browser while there is work and
 * for a while after, BOOTH_TABS tabs in it.
 */
export function createBooth(queue: BoothQueue, deps: BoothDeps) {
	const timing: BoothTiming = {
		launchMs: LAUNCH_MS,
		sittingMs: SITTING_MS,
		shotMs: SHOT_MS,
		relaunchAfterMs: RELAUNCH_AFTER_MS,
		lingerMs: LINGER_MS,
		...deps.timing,
	};
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
	/** Why a browser would not start, each said once in the log until one starts. */
	const said = new Set<string>();
	let retry: NodeJS.Timeout | undefined;
	let linger: NodeJS.Timeout | undefined;
	let closed = false;
	/** The last timing asked for; the next waits on it (`timedPace`). */
	let pacing: Promise<unknown> = Promise.resolve();
	/** Workers in the middle of a sitting or a shot, as against ones about to look for the next. */
	let occupied = 0;
	/** Browsers that went away since the last cover landed. */
	let lostInARow = 0;

	// The scheme covers render in: the machine's, until a canvas says which it
	// shows. A canvas that speaks first wins over the machine's answer, which is
	// asked for once, the first time anything needs it.
	let scheme: ColorScheme = "light";
	let canvasSaid = false;
	let asked: Promise<void> | undefined;
	const machineScheme = (): Promise<void> => {
		asked ??= (deps.systemScheme ?? systemColorScheme)().then(
			(found) => {
				if (!canvasSaid) scheme = found;
			},
			() => {},
		);
		return asked;
	};

	function enqueue(sitting: Sitting): void {
		if (closed) return;
		const failed = failedAt.get(keyOf(sitting.root, sitting.frame));
		if (sitting.reason === "missing" && failed !== undefined && failed + FAILED_COOLDOWN_MS > Date.now()) return;
		queue.add(sitting);
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

	const blocked = () => Date.now() < blockedUntil;

	/** Hand free tabs their work, launching the browser on the first. */
	function pump(): void {
		if (closed) return;
		const waiting = () => shots.length + (blocked() ? 0 : queue.waiting);
		// a worker between sittings takes the next one itself; one starts only for
		// work nobody alive is about to pick up
		while (slots.size < BOOTH_TABS && slots.size - occupied < waiting()) {
			if (linger !== undefined) {
				clearTimeout(linger);
				linger = undefined;
			}
			let slot = 0;
			while (slots.has(slot)) slot++;
			slots.add(slot);
			void work(slot).finally(() => {
				slots.delete(slot);
				settleIfIdle();
			});
		}
		if (blocked() && queue.waiting > 0) armRetry();
	}

	/** Try the browser again once the wait after a failed launch is over. */
	function armRetry(): void {
		if (retry !== undefined || closed || blockedUntil === Number.POSITIVE_INFINITY) return;
		retry = setTimeout(
			() => {
				retry = undefined;
				pump();
			},
			Math.max(0, blockedUntil - Date.now()),
		);
		retry.unref?.();
	}

	/**
	 * The last worker is done. Work that arrived as it left starts another;
	 * otherwise the queue has drained, the tabs go back to an empty page so no
	 * frame's document stays loaded for nobody, and the browser waits LINGER_MS for
	 * the next sitting before it closes and frees all of its memory.
	 */
	function settleIfIdle(): void {
		if (slots.size > 0 || closed) return;
		if (shots.length > 0 || (queue.waiting > 0 && !blocked())) {
			pump();
			return;
		}
		if (queue.waiting > 0) armRetry();
		for (const [slot, tab] of tabs) {
			tab.parking = within(tab.page.goto("about:blank"), ANSWER_MS, "parking").catch(() => retire(slot, tab));
		}
		if (linger !== undefined) clearTimeout(linger);
		linger = setTimeout(() => {
			linger = undefined;
			if (slots.size === 0 && running !== undefined) void end(running);
		}, timing.lingerMs);
		linger.unref?.();
	}

	/**
	 * Close a browser, and end its process when the close does not come back.
	 * It is forgotten first, so the next sitting launches another rather than
	 * asking anything of this one.
	 */
	function end(live: Running): Promise<void> {
		if (running === live) {
			running = undefined;
			tabs.clear();
		}
		live.ended ??= (async () => {
			const shell = await live.shell.catch(() => undefined);
			if (shell === undefined) return;
			try {
				await within(shell.close(), ANSWER_MS, "closing");
			} catch {
				await shell.kill().catch(() => {});
			}
		})();
		return live.ended;
	}

	/** The browser went away without being asked to: whatever was in it sits again in the next. */
	function lose(live: Running): void {
		if (live.ended !== undefined) return;
		lostInARow++;
		void end(live);
	}

	function browserNow(): Running {
		if (running !== undefined) return running;
		const live: Running = { shell: start(), context: undefined, control: undefined, ended: undefined };
		running = live;
		live.shell.then(
			(shell) => {
				// a browser started: whatever kept the covers waiting is over, and a
				// later failure is news worth saying again
				blockedUntil = 0;
				said.clear();
				shell.browser.on("disconnected", () => lose(live));
			},
			() => void end(live),
		);
		return live;
	}

	/** A session on the browser itself, asked for once per browser. */
	function controlOf(live: Running): Promise<CDPSession> {
		live.control ??= live.shell.then((shell) => shell.browser.newBrowserCDPSession());
		return live.control;
	}

	async function start(): Promise<HeadlessShell> {
		await machineScheme();
		try {
			return await launchInTime();
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
		return await launchInTime();
	}

	/** A launch under LAUNCH_MS. A browser that answers after it gave up is ended, never kept. */
	async function launchInTime(): Promise<HeadlessShell> {
		const launching = launch();
		try {
			return await within(launching, timing.launchMs, "starting");
		} catch (error) {
			if (!(error instanceof TimedOut)) throw error;
			void launching.then(
				(late) => late.kill(),
				() => {},
			);
			throw new Error(`the browser did not start within ${Math.round(timing.launchMs / 1000)} s`);
		}
	}

	/**
	 * The slot's tab, or with `alone` a tab of a context of its own that is
	 * never the slot's: a fake clock is the whole context's, and would reach
	 * every other tab's covers.
	 */
	async function tabFor(slot: number, alone = false): Promise<Tab> {
		const existing = alone ? undefined : tabs.get(slot);
		if (existing !== undefined) {
			await existing.parking;
			existing.parking = undefined;
			if (tabs.get(slot) === existing && existing.live.ended === undefined && existing.covers < COVERS_PER_PAGE) {
				return existing;
			}
			retire(slot, existing);
		}
		const live = browserNow();
		let shell: HeadlessShell;
		try {
			shell = await live.shell;
		} catch (error) {
			throw new LaunchFailure(describe(error), error instanceof HeadlessShellCannotRunError);
		}
		try {
			return await within(openTab(slot, live, shell, alone), ANSWER_MS * 2, "opening a tab");
		} catch {
			// it started, and has gone away or stopped answering since
			lose(live);
			throw new BrowserLost();
		}
	}

	async function openTab(slot: number, live: Running, shell: HeadlessShell, alone: boolean): Promise<Tab> {
		live.context ??= shell.browser.newContext({ viewport: null });
		const context = alone ? await shell.browser.newContext({ viewport: null }) : await live.context;
		const page = await context.newPage();
		const cdp = await context.newCDPSession(page);
		const { targetInfo } = (await cdp.send("Target.getTargetInfo")) as { targetInfo: { targetId: string } };
		const tab: Tab = {
			live,
			page,
			cdp,
			targetId: targetInfo.targetId,
			covers: 0,
			scheme: undefined,
			errors: [],
			entries: [],
			parking: undefined,
			alone: alone ? context : undefined,
		};
		page.on("pageerror", (error) => {
			// the stack, which a shot reads back to the frame's files (`stack-map.ts`)
			const text = error.stack ?? String(error);
			tab.errors.push(text);
			tab.entries.push({ type: "pageerror", text });
		});
		if (live.ended !== undefined) throw new BrowserLost();
		if (!alone) tabs.set(slot, tab);
		return tab;
	}

	/** A tab that failed a sitting, or has taken its share, is closed rather than trusted with the next. */
	function retire(slot: number, tab: Tab): void {
		if (tabs.get(slot) === tab) tabs.delete(slot);
		void (tab.alone ?? tab.page).close().catch(() => {});
	}

	/**
	 * A sitting ran out its deadline: the tab goes, closed by the browser rather
	 * than asked of a renderer that stopped answering, and when the browser
	 * itself does not answer either, its process is ended and every tab with it.
	 */
	async function abandon(slot: number, tab: Tab): Promise<void> {
		if (tabs.get(slot) === tab) tabs.delete(slot);
		try {
			const control = await within(controlOf(tab.live), ANSWER_MS, "closing");
			await within(control.send("Target.closeTarget", { targetId: tab.targetId }), ANSWER_MS, "closing");
		} catch {
			lose(tab.live);
			await end(tab.live);
		}
	}

	/** The work, under one deadline enforced from the daemon. */
	async function underDeadline<T>(slot: number, tab: Tab, ms: number, what: string, work: Promise<T>): Promise<T> {
		try {
			return await within(work, ms, what);
		} catch (error) {
			if (error instanceof TimedOut) await abandon(slot, tab);
			throw error;
		}
	}

	/**
	 * Whether the tab's browser went away, which no frame is blamed for. It is
	 * asked rather than trusted to have said so: its going and the failure it
	 * caused arrive in no promised order.
	 */
	async function browserGone(tab: Tab): Promise<boolean> {
		if (tab.live.ended !== undefined) return true;
		try {
			const control = await within(controlOf(tab.live), ANSWER_MS, "answering");
			await within(control.send("Browser.getVersion"), ANSWER_MS, "answering");
			return false;
		} catch {
			lose(tab.live);
			return true;
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
					if (error instanceof LaunchFailure) {
						blockRelaunch(error);
						return;
					}
				} finally {
					shooting.delete(shot);
					occupied--;
				}
				continue;
			}
			if (blocked()) return;
			const sitting = queue.take();
			if (sitting === undefined) return;
			occupied++;
			try {
				await runCover(slot, sitting);
			} catch (error) {
				// a daemon shutting down took the browser out from under the sitting
				if (closed) return;
				if (error instanceof LaunchFailure) {
					// not the frame's fault: it waits for a browser that starts
					if (deps.registered(sitting.root)) queue.putBack(sitting);
					blockRelaunch(error);
					return;
				}
				if (error instanceof BrowserLost) {
					// nor this: it sits again in the next browser, unless the browsers
					// keep going, which is the machine's trouble and not a frame's
					if (deps.registered(sitting.root)) queue.putBack(sitting);
					if (lostInARow < LOST_IN_A_ROW) continue;
					lostInARow = 0;
					blockRelaunch(new Error(`${LOST_IN_A_ROW} browsers in a row went away`));
					return;
				}
				// a frame whose folder went strange under it (a design boundary, a
				// vanished project) is that frame's problem, never the booth's
				log(`could not make a cover for "${sitting.frame}": ${describe(error)}`);
			} finally {
				occupied--;
				if (queue.release(sitting)) pump();
				deps.finished?.(sitting.root, sitting.frame);
			}
		}
	}

	/**
	 * Covers wait for a browser that starts: a minute, or, on a machine that
	 * cannot run one at all, until one does (a shot still tries, and so does the
	 * next daemon). The reason is logged once, never on every try.
	 */
	function blockRelaunch(error: Error): void {
		const cannotRun = error instanceof LaunchFailure && error.cannotRun;
		blockedUntil = cannotRun ? Number.POSITIVE_INFINITY : Date.now() + timing.relaunchAfterMs;
		if (!said.has(error.message)) {
			said.add(error.message);
			log(`the photo booth could not start a browser: ${error.message}`);
		}
		armRetry();
	}

	async function runCover(slot: number, sitting: Sitting): Promise<void> {
		const { root, frame } = sitting;
		const key = keyOf(root, frame);
		if (sitting.reason === "missing" && deps.covered(root, frame)) return;
		const origin = deps.origin();
		if (origin === undefined) return;
		const fail = (reason: string) => {
			failedAt.set(key, Date.now());
			deps.failed(root, frame, reason.slice(0, 240));
		};
		const owedAgain = (reason: BoothReason) => {
			if (deps.registered(root)) queue.add({ ...sitting, reason });
		};
		const { w, h } = deps.geometry(root, frame);
		const shape = coverShape(w, h);
		if (shape === undefined) return fail("too large for a cover");
		// a frame that is gone or will not compile needs no browser to say so
		const before = await deps.compile(root, frame);
		if (before.kind === "missing") return;
		if (before.kind === "error") return fail(before.message);
		const tab = await tabFor(slot);
		tab.covers++;
		let shot: Shot;
		try {
			const url = frameUrl(origin, sitting.project, frame);
			shot = await underDeadline(slot, tab, timing.sittingMs, "being photographed", sitCover(tab, url, shape));
		} catch (error) {
			if (closed) return;
			// a deadline closed the tab already, and the reason is the frame's
			if (error instanceof TimedOut) return fail(error.message);
			if (await browserGone(tab)) throw new BrowserLost();
			// a page that would not load or draw is not one to load the next frame into
			retire(slot, tab);
			return fail(describe(error));
		}
		if (shot.kind === "threw") return fail(`threw on boot: ${shot.message}`);
		if (shot.kind === "answered") {
			// gone, or its project is moving: nothing to picture and nothing to blame
			if (shot.status === 404 || shot.status === 409) return;
			if (shot.status !== 500) return fail(`its document answered ${shot.status}`);
			// the source broke between the compile and the load: its words, or
			// another try when it was fixed again in between
			const now = await deps.compile(root, frame);
			if (now.kind === "error") return fail(now.message);
			if (now.kind === "ok") owedAgain("edited");
			return;
		}
		// The picture is only stored when it is still of the frame: the frame is
		// there, and its source is the one the picture was taken of. Anything else
		// sits again rather than putting a stale picture over a good one.
		const now = await deps.compile(root, frame);
		if (now.kind === "missing") return;
		if (now.kind !== "ok" || now.etag !== (shot.etag ?? before.etag)) return owedAgain("edited");
		failedAt.delete(key);
		lostInARow = 0;
		const follows = followsColorScheme(now.document);
		deps.store(root, frame, shot.bytes, follows ? shot.scheme : undefined, now.source);
		// the canvas changed scheme while this frame was in the tab
		if (follows && shot.scheme !== scheme) owedAgain("stale");
		// timed only when an edit is what sat it: that is a frame an agent may be
		// about to check, and timing every picture would slow the first pass
		// through a project for frames nobody touched
		if (sitting.reason === "edited" && deps.paced !== undefined) {
			deps.paced(root, frame, await timedPace(slot, tab, shape));
		}
	}

	/**
	 * The frame still in the tab, timed at a Retina density; nothing when it could
	 * not be. One tab times at a time, since a frame being timed shares the GPU
	 * with whatever the other tabs are drawing, and a slow result is timed once
	 * more and the faster kept: three frames edited together timed one ordinary
	 * frame at 50 a second beside that canvas, against 120 on its own.
	 */
	function timedPace(slot: number, tab: Tab, shape: CoverShape): Promise<FramePace | undefined> {
		const scale = Math.min(PACE_SCALE, Math.sqrt(PACE_PIXELS / (shape.width * shape.height)));
		const attempt = async (): Promise<FramePace | undefined> => {
			try {
				return await underDeadline(slot, tab, PACE_DEADLINE_MS, "being timed", pace(tab, shape, scale));
			} catch (error) {
				if (closed) return undefined;
				// too few display frames to count in the whole deadline: the slowest a
				// frame can be, and the deadline has closed its tab already
				if (error instanceof TimedOut) return { perSecond: 0, slowestMs: PACE_DEADLINE_MS, scale: rounded(scale) };
				// whatever went wrong took the page with it, never the picture already stored
				retire(slot, tab);
				return undefined;
			}
		};
		const turn = pacing.then(async () => {
			const first = await attempt();
			if (first === undefined || first.perSecond >= SLOW_PER_SECOND || first.perSecond === 0) return first;
			const again = await attempt();
			return again !== undefined && again.perSecond > first.perSecond ? again : first;
		});
		pacing = turn;
		return turn;
	}

	async function pace(tab: Tab, shape: CoverShape, scale: number): Promise<FramePace> {
		await tab.cdp.send("Emulation.setDeviceMetricsOverride", {
			width: shape.width,
			height: shape.height,
			deviceScaleFactor: scale,
			mobile: false,
		});
		const world = await isolatedWorld(tab);
		const timed = (await evaluate(
			tab,
			world,
			`(${paceSource})(${PACE_WARM_MS}, ${PACE_WINDOW_MS}, ${PACE_FRAMES})`,
		)) as Omit<FramePace, "scale">;
		return { ...timed, scale: rounded(scale) };
	}

	/** Load, settle and photograph one frame for its cover. */
	async function sitCover(tab: Tab, url: string, shape: CoverShape): Promise<Shot> {
		const taken = await prepare(tab, shape);
		const response = await tab.page.goto(url, { waitUntil: "domcontentloaded", timeout: 0 });
		if (response === null) return { kind: "answered", status: 0 };
		if (response.status() !== 200) return { kind: "answered", status: response.status() };
		// a document the cache revalidated answers as the 200 it confirmed, with
		// that answer's etag: the source the picture is of either way (one that
		// names none is taken to be the compile just before it)
		const etag = response.headers().etag;
		const world = await isolatedWorld(tab);
		const rendered = await booted(tab, world, COVER_BOOT_MS, true);
		if (!rendered && tab.errors[0] !== undefined) return { kind: "threw", message: describe(tab.errors[0]) };
		await settled(tab, world);
		const bytes = await screenshot(tab, {
			format: "jpeg",
			quality: Math.round(COVER_QUALITY * 100),
			optimizeForSpeed: true,
			clip: { x: 0, y: 0, width: shape.width, height: shape.height, scale: 1 },
		});
		return { kind: "picture", bytes, etag, scheme: taken };
	}

	async function runShot(slot: number, pending: PendingShot): Promise<ShotResult> {
		const origin = deps.origin();
		if (origin === undefined) throw new Error("the daemon is not listening yet");
		const { request } = pending;
		// a shot that runs the frame's clocks fakes them for its whole context
		const tab = await tabFor(slot, (request.at?.length ?? 0) > 0);
		// the console is a shot's to keep, and only a shot's: a frame logging every
		// tick would otherwise cost every cover the serialization of every line
		const onConsole = (message: ConsoleMessage) => {
			const text = consoleText(message);
			// what the shot's own watch saw (`WATCH_SOURCE`), said as spool's
			if (text.startsWith(WATCH_MARK)) tab.entries.push({ type: "spool", text: text.slice(WATCH_MARK.length) });
			else tab.entries.push({ type: message.type(), text });
		};
		tab.page.on("console", onConsole);
		let watch: Disposable | undefined;
		try {
			const url = frameUrl(origin, request.project, request.frame, request.scenario);
			const ms = timing.shotMs + Math.max(0, ...(request.at ?? []));
			const shot = (async () => {
				watch = await shotOnly(tab);
				return await sitShot(tab, url, request);
			})();
			return await underDeadline(slot, tab, ms, "booting", shot);
		} catch (error) {
			if (error instanceof LaunchFailure || error instanceof TimedOut) throw error;
			if (error instanceof BrowserLost || (await browserGone(tab))) {
				throw new Error("the browser went away during the shot; run it again");
			}
			retire(slot, tab);
			throw error;
		} finally {
			tab.page.off("console", onConsole);
			// a tab of its own leaves with its shot; the slot's tab loses only the
			// shot's own additions, and goes on making covers as it was
			if (tab.alone !== undefined) retire(slot, tab);
			else if (tabs.get(slot) === tab) await leaveShot(tab, watch).catch(() => retire(slot, tab));
		}
	}

	/**
	 * What only a shot's boot gets, ahead of its document: React's development
	 * build, and the watch that says when the frame's WebGL is lost or drawn in
	 * software. Answers the watch, for `leaveShot` to take away.
	 */
	async function shotOnly(tab: Tab): Promise<Disposable> {
		const reactDev = deps.reactDev;
		if (reactDev !== undefined) {
			await tab.page.route(`**${VENDOR_REACT_URL}`, async (route) => {
				try {
					await route.fulfill({
						status: 200,
						headers: {
							"content-type": "text/javascript; charset=utf-8",
							"access-control-allow-origin": "*",
							"cache-control": "no-store",
						},
						body: await reactDev(),
					});
				} catch {
					await route.continue().catch(() => {});
				}
			});
		}
		return await tab.page.addInitScript({ content: WATCH_SOURCE });
	}

	async function leaveShot(tab: Tab, watch: Disposable | undefined): Promise<void> {
		if (deps.reactDev !== undefined) await tab.page.unroute(`**${VENDOR_REACT_URL}`);
		await watch?.dispose();
	}

	/** One boot for an agent: the shot's slices at each time, the console, and how tall the content ran. */
	async function sitShot(tab: Tab, url: string, request: ShotRequest): Promise<ShotResult> {
		const taken = await prepare(tab, { width: request.width, height: request.height, scale: request.scale });
		const { at } = request;
		if ((at?.length ?? 0) > 0) await stopClocks(tab);
		const response = await tab.page.goto(url, { waitUntil: "domcontentloaded", timeout: 0 });
		if (response !== null && response.status() >= 500) return { kind: "unserved", status: response.status() };
		const world = await isolatedWorld(tab);
		// frames are blank until React commits (#16); one that renders nothing
		// is legitimate, so running this out still shoots what is there. A
		// stopped clock is run alongside, for a frame whose first render waits on
		// a timer, and stopped again the moment it commits
		const times = at ?? [];
		const step = times.length === 0 ? undefined : () => tab.page.clock.runFor(SEEK_STEP_MS);
		await booted(tab, world, SHOT_BOOT_MS, false, step);
		const top = request.scroll === undefined ? 0 : await scrollTo(tab, world, request.scroll);
		const slices = async (): Promise<Buffer[]> => {
			await within(
				evaluate(tab, world, "document.fonts.ready.then(() => true)"),
				SHOT_FONTS_MS,
				"loading fonts",
			).catch(() => {});
			const pngs: Buffer[] = [];
			for (const tile of request.tiles) {
				pngs.push(
					await screenshot(tab, {
						format: "png",
						clip: { x: 0, y: top + tile.y, width: request.width, height: tile.height, scale: 1 },
					}),
				);
			}
			return pngs;
		};
		const shots: Array<{ at?: number; pngs: Buffer[] }> = [];
		if (times.length === 0) {
			await settled(tab, world);
			shots.push({ pngs: await slices() });
		} else {
			// each time is a place in the frame's own clock from its commit: the
			// clock runs on from the last time to the next, and stands still while
			// each is shot
			await seekFrom(tab, world);
			let ran = 0;
			for (const time of times) {
				await seek(tab, world, ran, time);
				ran = Math.max(ran, time);
				shots.push({ at: time, pngs: await slices() });
			}
		}
		// the content's own bottom, as the canvas reads it; a viewport-sized app
		// that does not scroll has none, and runs exactly as tall as the document
		const own = Number(await evaluate(tab, world, `${frameShims.boothProbes}.contentHeight()`));
		const contentHeight =
			own > 0 ? own : Number(await evaluate(tab, world, "document.documentElement.scrollHeight")) || 0;
		const found =
			request.find === undefined
				? {}
				: {
						found: readNamedElement(
							await evaluate(
								tab,
								world,
								`${frameShims.boothProbes}.namedElement(${JSON.stringify(request.find)})`,
							),
						),
					};
		return {
			kind: "booted",
			shots,
			entries: [...tab.entries],
			errors: [...tab.errors],
			contentHeight,
			scheme: taken,
			...found,
		};
	}

	/**
	 * Scrolls the document down `px` at once, past any smooth scroll-behavior the
	 * frame sets, and answers where it landed. A document that runs out first
	 * stops at its end, and the shot says so in a [spool] line.
	 */
	async function scrollTo(tab: Tab, world: number, px: number): Promise<number> {
		const landed = Number(
			await evaluate(
				tab,
				world,
				`(() => { window.scrollTo({ top: ${px}, left: 0, behavior: "instant" }); return window.scrollY; })()`,
			),
		);
		if (landed < px) {
			tab.entries.push({
				type: "spool",
				text: `scrolled to ${Math.round(landed)}, not ${px}: the document runs out there`,
			});
		}
		return landed;
	}

	/** Metrics, scheme and a clean slate for the next document in this tab; answers the scheme it set. */
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
	async function booted(
		tab: Tab,
		world: number,
		budgetMs: number,
		stopOnError: boolean,
		step?: () => Promise<void>,
	): Promise<boolean> {
		const began = performance.now();
		const deadline = began + budgetMs;
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
			// a step taken as the frame commits would land its first effects a step
			// early, so the clock runs only for a frame that has waited a while
			if (performance.now() - began > STEP_AFTER_MS) await step?.();
			await pause(16);
		}
		return false;
	}

	/**
	 * Stops every clock the frame can read, before its document loads, so `--at`
	 * is a place in the frame's own time rather than a wait: its JavaScript
	 * clocks (Date, performance.now, timers, requestAnimationFrame) through
	 * Playwright's fake clock, and its CSS and Web Animations by holding the
	 * document timeline still. The fake clock is the whole context's, so this is
	 * only ever a tab of its own (`tabFor`).
	 */
	async function stopClocks(tab: Tab): Promise<void> {
		const now = Date.now();
		// installed a minute back, as the installed clock runs on until it is
		// paused and a pause can only go forward: on a busy machine the install
		// alone can outlast the time it was given. Nothing has a timer yet to fire
		await tab.page.clock.install({ time: now - 60_000 });
		await tab.page.clock.pauseAt(now);
		await tab.cdp.send("Animation.enable");
		await tab.cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
	}

	/** Where a seek counts from: the frame just committed, its animations born at 0. */
	async function seekFrom(tab: Tab, world: number): Promise<void> {
		// the first commit's effects, which start the frame's own clocks, run first
		await pause(SEEK_FLUSH_MS);
		await evaluate(
			tab,
			world,
			`globalThis.spoolBorn = new WeakMap(); globalThis.spoolTag = (t) => { for (const a of document.getAnimations()) if (!spoolBorn.has(a)) spoolBorn.set(a, t); }; spoolTag(0)`,
		);
	}

	/**
	 * Runs the frame's stopped clocks on from `from` to `at` ms past its first
	 * commit (`seekFrom`), a step at a time, noting the step each animation first
	 * appeared at, then sets every animation on the document timeline to its own
	 * age. The same frame shot at the same `at` lands on the same picture, to
	 * within a step of its JavaScript time, however slow the machine.
	 */
	async function seek(tab: Tab, world: number, from: number, at: number): Promise<void> {
		for (let ran = from; ran < at; ) {
			const step = Math.min(SEEK_STEP_MS, at - ran);
			await tab.page.clock.runFor(step);
			ran += step;
			await evaluate(tab, world, `spoolTag(${ran})`);
		}
		await evaluate(
			tab,
			world,
			`for (const a of document.getAnimations()) { if (a.timeline !== document.timeline) continue; try { a.currentTime = ${at} - (spoolBorn.get(a) ?? ${at}); } catch {} }`,
		);
		// what the last step scheduled (React's render of it) runs on real time
		await pause(SEEK_FLUSH_MS);
	}

	/**
	 * The shim's own settle, run where frame code cannot reach it, and waited on
	 * for no longer than its budget and a grace before the picture is taken.
	 */
	async function settled(tab: Tab, world: number): Promise<void> {
		await within(
			evaluate(
				tab,
				world,
				`${frameShims.boothProbes}.settle(${SETTLE_BUDGET_MS}, (callback) => requestAnimationFrame(callback))`,
			),
			SETTLE_BUDGET_MS + SETTLE_GRACE_MS,
			"settling",
		).catch((error: unknown) => {
			if (!(error instanceof TimedOut)) throw error;
		});
	}

	async function screenshot(tab: Tab, params: Record<string, unknown>): Promise<Buffer> {
		const shot = (await tab.cdp.send("Page.captureScreenshot", params)) as { data: string };
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
		/**
		 * A canvas showed a scheme it was not showing before. True when that is a
		 * change for the booth, so the covers it made stale can be asked for.
		 */
		setScheme(next: ColorScheme): boolean {
			canvasSaid = true;
			if (next === scheme) return false;
			scheme = next;
			return true;
		},
		get scheme(): ColorScheme {
			return scheme;
		},
		/** Settles once the booth knows the scheme it starts in. */
		schemeKnown: machineScheme,
		async close(): Promise<void> {
			closed = true;
			if (retry !== undefined) clearTimeout(retry);
			if (linger !== undefined) clearTimeout(linger);
			for (const pending of shots.splice(0)) pending.reject(new Error("the daemon is shutting down"));
			if (running !== undefined) await end(running);
		},
	};
}

/** What the find probe answered, as the daemon may trust it: a found element's handles and place, or null. */
function readNamedElement(value: unknown): NamedElement | null {
	if (!isRecord(value)) return null;
	const { x, y, selector, outerHtml, source, generated } = value;
	if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
	if (typeof selector !== "string" || typeof outerHtml !== "string" || typeof generated !== "boolean") return null;
	if (!(source === null || typeof source === "string")) return null;
	return { x, y, selector, outerHtml, source, generated };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
