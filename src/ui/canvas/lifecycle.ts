import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_MIN_CSS_PX } from "../../cover";
import { type Camera, captureOrigin, type ProjectedFrame } from "../api";
import { intersects } from "./camera";
import { CAPTURE_WORKER_TIMEOUT_MS, type CoverRaster, captureRequestId, rasterCaptureSource } from "./capture-broker";
import { type CaptureSourceReply, captureMessage, freezeMessage } from "./protocol";

/**
 * The engine lifecycle (#8, #13, #40, #54, #112): which frames hold a document,
 * and why. Mounting is caused, never scheduled:
 *
 *   1. you went inside a frame,
 *   2. its picture is missing,
 *   3. its picture is wrong.
 *   4. it is large enough to read and intersects the viewport's ring.
 *
 * The fourth cause is bounded by viewport area rather than page size. Causes 2
 * and 3 are the same errand: borrow the frame long enough to photograph it.
 * The sweep hands that errand out a couple at a time.
 *
 * Intent holds a document too: every frame represented by the element
 * selection. With no element picks, Select instead holds the selected frame,
 * or the entered frame while its modifier is down. A frame being exported is
 * held separately. A readable selected HTML frame stays
 * live; an unreadable one stays held behind its still and keeps running.
 *
 * A picture stands in below the readable threshold. Above it, a nearby frame
 * is live; a borrowed or held frame remains behind its still.
 *
 * HTML documents keep running: Select leaves a readable one live, and an
 * unreadable held one runs behind its still. A terminal's held state sends
 * SIGSTOP to its real process (`daemon/term-sessions.ts`).
 *
 * Live HTML frames hold their animations while the camera moves (#171) and
 * again once nothing has attended them for a long minute (#172) — the mount is
 * unchanged either way, only the frames it is running.
 */

export type FrameState = "picture" | "refreshing" | "held" | "live";

const SWEEP_MS = 300;
const EXPORT_MOUNT_TIMEOUT_MS = 20_000;

function isExportMountReady(
	state: FrameState | undefined,
	ready: boolean,
	sourceWindow: WindowProxy | null | undefined,
): boolean {
	return state !== undefined && state !== "picture" && ready && sourceWindow != null;
}

/**
 * How long a whole self-capture may take: the shim's serialization, the hops
 * between three realms and the worker's raster budget. It has to outlast
 * the worker's, or this timer retires a capture that was still working.
 */
export const CAPTURE_REPLY_TIMEOUT_MS = CAPTURE_WORKER_TIMEOUT_MS + 3000;
/**
 * How long a booted frame runs before its still is worth taking. Frames animate
 * their content in; a capture fired on the loaded report records the frame
 * mid-arrival, and that half-drawn picture is what the canvas then shows in the
 * frame's place from then on. The shim waits for its own animations too — this
 * is the outer bound, for the entry animations no timing API sees.
 */
export const CAPTURE_AFTER_READY_MS = 1500;
/**
 * How long a frame's picture may stay wrong before the sweep stops waiting out
 * CAPTURE_AFTER_READY_MS. That wait is right for one write: it buys the
 * settle a source edit's own reboot deserves. It has no ceiling past that, and
 * a steady stream of writes reloads the frame on every one of them — a reload
 * takes the boot's memory with it, so the wait restarts before it ever
 * finishes, and the cover falls up to tens of seconds behind the file an
 * agent is still streaming into (#215). Past this cap the sweep stops waiting
 * for the reboot to settle and takes the shot the moment the borrowed
 * document reports loaded, mid-arrival warts and all. That photograph may be
 * a little wrong, but never wrong for longer than this, and the next capture
 * — settled or not — heals whatever it got wrong.
 */
export const CAPTURE_MAX_STALE_MS = 4000;
/**
 * How long a frame may wait, inside the capture itself, for its fonts to load
 * and its entry animations to finish before it photographs itself.
 *
 * It is the dominant term in an errand — #94 priced one at 130 to 170 ms booted
 * and discarded, 389 to 570 photographed, and 660 to 1437 with this budget on
 * top — and it stays, because what it costs has changed hands. It used to be
 * paid by whoever was waiting for the picture; a walk paid it on arrival until
 * #110 moved the walk off the capture entirely, and the sweep paid it on a
 * mounted frame you could see. Now it is paid out of an errand slot nobody is
 * waiting on, behind a still that is already on screen. The only thing it buys
 * is a truer picture, and the picture is the only thing anyone looks at.
 */
export const CAPTURE_SETTLE_BUDGET_MS = 900;
/**
 * How many frames may be borrowed for a picture at once — the whole of the
 * pacing, and a count in flight rather than a rate per tick: a rate is a
 * hardcoded guess at how long a mount takes, and the guess this replaces was
 * out by a factor of thirteen (#94). A count adapts to the daemon and the
 * connection pool on its own. #94 swept it under 6x throttle and found it
 * breaks reproducibly above 3 and never at or below it.
 */
const SHIPPED_ERRANDS_IN_FLIGHT = 3;
/**
 * The measurement hook (#108, #112), and the only temporary code the canvas
 * carries. `bench/mount-gesture.ts` sweeps the cap above and below
 * its shipped value to show where a gesture starts paying for the errands
 * behind it, and the alternative is a second lifecycle model living in the
 * bench, which is strictly worse. The bench throws rather than running without
 * it: a gesture over a canvas that borrowed nothing reads as "mounting is free"
 * for the one reason that proves nothing.
 *
 * `globalThis.__spoolBench` is `{ errands, freeze }` — the cap, unbounded at 0
 * or below, and whether live frames ever hold their animations. Read once at
 * module load, because playwright's init script runs before this bundle
 * evaluates and nothing else ever writes it, so an unset hook leaves the sweep
 * comparing against the same constants it always did.
 *
 * They fold into the exported values rather than shadowing them, so the sweep
 * and every test read the one number the decision actually uses. `freeze` is
 * `bench/dither-attribution.ts`'s control arm: the freeze is what that bench
 * measures, and measuring it against a differently-patched project instead of
 * against itself would confound the one difference it exists to price.
 */
const benchHooks = (globalThis as unknown as { __spoolBench?: { errands?: number; freeze?: boolean } }).__spoolBench;
const benchErrands = benchHooks?.errands;
export const ERRANDS_IN_FLIGHT =
	benchErrands === undefined ? SHIPPED_ERRANDS_IN_FLIGHT : benchErrands > 0 ? benchErrands : Number.POSITIVE_INFINITY;
export const FREEZE_ENABLED = benchHooks?.freeze !== false;
/**
 * How long a live frame goes unattended before it holds its animations (#172).
 *
 * A minute is deliberately long. Comparing two frames' motion side by side is a
 * real workflow and the pointer is not on either of them while you do it, so
 * the canvas has to stay alive for the whole of a look, not the whole of a
 * gesture. What this catches is the other thing: a canvas left open in a tab
 * somebody walked away from, where eight animated frames were measured holding
 * 45% of a core and 16% of the GPU process for as long as it stayed open.
 */
export const IDLE_FREEZE_MS = 60_000;
/**
 * How many errands a frame gets for one debt before it stops asking. Without a
 * bound, a frame whose capture cannot land — a document that never boots, a
 * shim that never answers — would mount, fail, unmount and mount again forever,
 * because neither "it has no picture" nor "its picture is wrong" stops being
 * true by being acted on. Anything that changes the frame (a source edit,
 * leaving it, a fresh boot) clears the count and the frame asks again.
 */
export const PICTURE_TRIES = 3;
/**
 * How long a borrowed frame is given before it is handed back unfinished. The
 * errand is the one mount nobody asked for, so it is the one that needs a
 * deadline: a document that never reports loaded would otherwise hold its slot
 * for the rest of the session. Wide enough to outlast a cold boot, the wait for
 * the frame to finish arriving, and the capture's own outer bound — a deadline
 * that retires working captures would be a slow leak of pictures, not a guard.
 */
export const ERRAND_DEADLINE_MS = 20_000 + CAPTURE_AFTER_READY_MS + CAPTURE_REPLY_TIMEOUT_MS + CAPTURE_SETTLE_BUDGET_MS;

/** The decision function's persistent bookkeeping, owned by the hook, fabricated by tests. */
export interface LifecycleModel {
	/** Frames whose picture is wrong — a source edit, a document that ran, a fresh boot. */
	stale: Set<string>;
	/** When each stale frame's picture first became wrong, for the CAPTURE_MAX_STALE_MS cap (#215). */
	staleSince: Map<string, number>;
	/**
	 * Frames that have run long enough since booting to be worth photographing —
	 * or overdue enough past CAPTURE_MAX_STALE_MS (#215) that the sweep stops
	 * waiting to find out.
	 */
	arrived: Set<string>;
	/** Frames borrowed to be photographed, and when the errand began. */
	errands: Map<string, number>;
	/** Frames whose last errand came back with a picture — the cover may still be in flight to disk. */
	photographed: Set<string>;
	/** Errands a frame has already been given for the picture it owes, capped at PICTURE_TRIES. */
	tries: Map<string, number>;
	/** Frames the readable model made live, rather than frames you entered. */
	modelLive: Set<string>;
	/** Frames whose current document was entered and must refresh when it leaves. */
	wentInside: Set<string>;
}

export function createLifecycleModel(): LifecycleModel {
	return {
		stale: new Set(),
		staleSince: new Map(),
		arrived: new Set(),
		errands: new Map(),
		photographed: new Set(),
		tries: new Map(),
		modelLive: new Set(),
		wentInside: new Set(),
	};
}

/**
 * How far past the viewport a frame is still admitted, as a fraction of it. The
 * ring is what hides the boot: a
 * frame that only mounts once it is on screen is a frame you watch arrive.
 */
export const LIVE_MARGIN = 0.25;

/**
 * The borrowed frame is handed back. A picture that landed pays the debt
 * outright — the cover is on its way to disk and the projection follows it, so
 * `hasCover` is briefly still false and must not start the errand over. A
 * picture that never came counts as one try.
 */
export function noteErrandShot(model: LifecycleModel, frame: string, captured: boolean): void {
	model.errands.delete(frame);
	if (captured) {
		model.stale.delete(frame);
		model.staleSince.delete(frame);
		model.photographed.add(frame);
		model.tries.delete(frame);
		return;
	}
	// The debt stands. A frame whose picture is wrong is still wrong when the
	// capture that was going to fix it came back empty-handed, so the errand is
	// worth trying again — bounded, because "its picture is wrong" would
	// otherwise stay true however many times it is acted on.
	model.tries.set(frame, (model.tries.get(frame) ?? 0) + 1);
}

export interface SweepInput {
	frames: readonly ProjectedFrame[];
	entered: string | null;
	/** Every frame Select currently owns: mounted for the element selection. */
	selectionTargets: ReadonlySet<string>;
	/** A frame being read rather than looked at — an export in flight holds one mounted. */
	held: string | null;
	states: Readonly<Record<string, FrameState>>;
	/** Frames whose boot has reported loaded, and when — the ones a capture can reach. */
	ready: ReadonlyMap<string, number>;
	/** Frames with a capture already in flight. */
	capturing: ReadonlySet<string>;
	hasCover: (frame: string) => boolean;
	now: number;
	/** Where the camera rests, read when this sweep runs. */
	camera: Camera | null;
	/** The viewport's CSS size, read when this sweep runs. */
	viewport: { width: number; height: number } | null;
	/**
	 * Every frame goes back to its picture, whatever it was doing (#210).
	 * Inline play covers the canvas, so nothing out here is being looked at and
	 * the machine the player is running on gets the whole browser.
	 */
	pictured: boolean;
	/**
	 * Every frame the project has, against which the bookkeeping is pruned (#39).
	 *
	 * `frames` is one page's worth, because a page is the canvas. What a frame is
	 * owed is not: an agent editing a frame on the page you are not on stales its
	 * picture, and pruning against what is on screen would forget that inside one
	 * sweep. Then you switch pages and find a picture of the document as it was,
	 * with nobody owing you a new one. Absent means the caller has no wider list,
	 * and the page on screen is the whole projection.
	 */
	projection?: ReadonlySet<string>;
}

/**
 * Whether a readable frame gets a document:
 * drawn wide enough to read, and inside the viewport's own ring.
 *
 * Both conditions are load-bearing and neither is sufficient. Size alone would
 * mount a whole zoomed-in page including the part of it a mile off screen; the
 * ring alone would mount fifty frames at overview zoom, which `bench/canvas.ts`
 * prices at the first dropped frame.
 */
function isFrameLive(
	frame: ProjectedFrame,
	camera: Camera | null,
	viewport: { width: number; height: number } | null,
): boolean {
	if (camera == null || viewport == null) return false;
	if (frame.w * camera.k < LIVE_MIN_CSS_PX) return false;
	const w = viewport.width / camera.k;
	const h = viewport.height / camera.k;
	return intersects(frame, {
		x: -camera.x / camera.k - w * LIVE_MARGIN,
		y: -camera.y / camera.k - h * LIVE_MARGIN,
		w: w * (1 + LIVE_MARGIN * 2),
		h: h * (1 + LIVE_MARGIN * 2),
	});
}

/**
 * Whether a frame holds its animations right now (#171, #172). Two causes, and
 * both of them are "nobody is reading this frame". The camera is moving, so
 * nothing out there is being read at all and the frames' own rAF loops are what
 * the gesture competes with for the renderer. Or the frame has gone
 * `IDLE_FREEZE_MS` without anything attending it — see `isFrameAttended` for
 * what counts, and note that a camera at rest is not attention, only its motion.
 *
 * Three frames never freeze. The one you went inside is the one being used. A
 * borrowed frame is mid-errand, and a capture settles on the frame's own rAF
 * and animations, so a frozen one would photograph itself held; a frame with a
 * capture already in flight is that same errand, one step later.
 */
export function isFrameFrozen(input: {
	cameraMoving: boolean;
	/** How long since anything last attended this frame. */
	idleMs: number;
	state: FrameState | undefined;
	entered: boolean;
	capturing: boolean;
}): boolean {
	const { cameraMoving, idleMs, state, entered, capturing } = input;
	if (state !== "live" || entered || capturing) return false;
	return cameraMoving || idleMs >= IDLE_FREEZE_MS;
}

/**
 * Whether anything is attending this frame right now (#172) — the idle clock
 * runs from the last moment this was true.
 *
 * Genuine idleness, never viewport position: a frame you are looking at is a
 * frame you are not touching, and freezing what is merely off to one side would
 * kill side-by-side comparison outright. So it takes a pointer, a selection, an
 * entry, or a camera in motion — every one of them something a person did.
 */
export function isFrameAttended(input: {
	cameraMoving: boolean;
	entered: boolean;
	selected: boolean;
	hovered: boolean;
}): boolean {
	const { cameraMoving, entered, selected, hovered } = input;
	return cameraMoving || entered || selected || hovered;
}

export interface SweepResult {
	states: Record<string, FrameState>;
	changed: boolean;
	/**
	 * Borrowed frames that have run long enough to be worth photographing now, or
	 * are overdue enough (#215) that mid-arrival is worth photographing too. An
	 * overdue capture asks for none of CAPTURE_SETTLE_BUDGET_MS: it has to land
	 * before the next write retires it.
	 */
	refreshCaptures: Array<{ frame: string; overdue: boolean }>;
}

export function sweepLifecycle(model: LifecycleModel, input: SweepInput): SweepResult {
	const { frames, states, ready, capturing, hasCover, now, pictured } = input;
	// One substitution rather than a branch per rule: nobody is asking for a
	// frame, and a null camera sees none of them, so every intent this function
	// can form is already the resting one.
	const entered = pictured ? null : input.entered;
	const selectionTargets = pictured ? NOTHING : input.selectionTargets;
	const held = pictured ? null : input.held;
	const camera = pictured ? null : input.camera;
	const viewport = pictured ? null : input.viewport;
	// A frame going back to its picture can be told from a frame you left.
	// Zooming out must not bill a screenful of frames for a fresh still; going
	// inside one still must.
	const wasModelLive = model.modelLive;
	model.modelLive = new Set();

	for (const [name, startedAt] of [...model.errands]) {
		if (now - startedAt >= ERRAND_DEADLINE_MS) noteErrandShot(model, name, false);
	}

	interface Entry {
		frame: ProjectedFrame;
		current: FrameState;
		/** What intent asks for, or null when nobody is asking for this frame. */
		intent: FrameState | null;
		/** Its picture is missing or wrong, and it may still ask for one. */
		debt: boolean;
		/** Stale long enough that CAPTURE_AFTER_READY_MS is no longer worth waiting out (#215). */
		overdue: boolean;
	}
	const entries: Entry[] = [];
	const candidates: string[] = [];
	const alive = new Set<string>();
	/** A frame mounted because somebody asked for it, still waiting on its boot. */
	let awaited = false;

	for (const frame of frames) {
		const name = frame.name;
		alive.add(name);
		const current = states[name] ?? "picture";
		// Select wins over entering: it takes the pointer back to reach an
		// element. A readable HTML frame remains the live thing it is showing.
		if (entered === name && frame.kind !== "term") model.wentInside.add(name);
		const modelLive = isFrameLive(frame, camera, viewport);
		const selected = selectionTargets.has(name);
		if (modelLive && entered !== name && !model.wentInside.has(name)) {
			model.modelLive.add(name);
		}
		let intent: FrameState | null;
		if (selected && frame.kind === "html" && modelLive) {
			intent = "live";
		} else if (selected) {
			intent = "held";
		} else if (entered === name || modelLive) {
			intent = "live";
		} else if (held === name) {
			intent = "held";
		} else {
			intent = null;
		}

		// A frame you were inside ran, and what it showed while it ran is not
		// what its still records — leaving it is a change like any other.
		// Zooming past a frame is not using it, and a still of a freshly booted
		// frame is still true of the frame that just booted and did nothing.
		if (current === "live" && intent !== "live" && frame.kind !== "term" && !wasModelLive.has(name)) {
			markPictureWrong(model, name);
			model.wentInside.delete(name);
		}

		// The clock on how long this frame's picture has been wrong, not on how
		// long it has lacked a cover outright: a cold-boot frame with no cover yet
		// gets the settle its first still is owed, same as always. Only a picture
		// that was once right and went wrong starts owing a deadline (#215).
		if (model.stale.has(name)) {
			if (!model.staleSince.has(name)) model.staleSince.set(name, now);
		} else {
			model.staleSince.delete(name);
		}
		const staleSince = model.staleSince.get(name);
		const overdue = staleSince !== undefined && now - staleSince >= CAPTURE_MAX_STALE_MS;

		// A still is only worth what the frame was doing when it was taken. A
		// frame that booted a moment ago is still arriving, and one that never
		// ran never arrived at all — both photograph as an absence, and the
		// canvas would then show that absence in the frame's own place. Having
		// run long enough once is remembered, and a reload takes the memory with
		// the boot. Overdue skips the wait outright: a mid-arrival photograph
		// beats one that is tens of seconds behind the file (#215), and the next
		// capture heals whatever this one gets wrong.
		const readyAt = ready.get(name);
		if (readyAt === undefined) model.arrived.delete(name);
		else if (
			running(current, frame.kind) &&
			!model.arrived.has(name) &&
			(now - readyAt >= CAPTURE_AFTER_READY_MS || overdue)
		) {
			model.arrived.add(name);
		}

		// A frame with no picture, or the wrong one, is worth a document for as
		// long as it takes to photograph it. Terminals are out: their still is
		// the daemon's grid (#42), never a self-capture.
		// A picture that landed clears `photographed` the moment the projection
		// catches up: the flag only ever bridges the gap between a shot resolving
		// and its cover reaching disk, and holding it any longer would mean a
		// cover deleted later never being noticed.
		if (model.photographed.has(name) && hasCover(name)) model.photographed.delete(name);
		const debt =
			frame.kind !== "term" &&
			!model.photographed.has(name) &&
			(model.tries.get(name) ?? 0) < PICTURE_TRIES &&
			(model.stale.has(name) || !hasCover(name));

		// Intent takes a borrowed frame back: it now has a document for a reason
		// somebody asked for, so the errand hands its slot over and the debt
		// stands until the frame is free again.
		if (intent !== null) {
			model.errands.delete(name);
			if (readyAt === undefined) awaited = true;
		}

		entries.push({ frame, current, intent, debt, overdue });
		if (intent === null && debt && !model.errands.has(name)) candidates.push(name);
	}

	// The errand queue is not a queue: the cap is on frames borrowed at once, and
	// whoever is owed a picture when a slot frees takes it. There is no order
	// worth imposing, because no order is visible — every one of them is showing
	// a picture the whole time.
	//
	// And no camera gate. #80 made mounting wait for a still camera on the theory
	// that a booting document's paint is the stutter; #94 disproved that outright
	// and #112 deleted the gate rather than reverting it. A gesture over frames
	// being borrowed underneath it drops nothing, measured at 6x throttle in
	// `bench/mount-gesture.ts`.
	//
	// What an errand does have to stay out of the way of is a boot somebody is
	// waiting on. Not for the paint — for the daemon, the connection pool and the
	// compile the arriving document needs, all of which an errand is asking for
	// too. Deleting the camera gate without this cost a cross-page walk 73 ms of
	// its 220 ms bar (`bench/walk.ts`, 266.7 p50 against 193.9), because a page
	// switch puts a screenful of frames that owe pictures on screen at the exact
	// moment the target is booting. An errand is never urgent; an arrival is.
	if (!awaited) {
		for (const name of candidates) {
			if (model.errands.size >= ERRANDS_IN_FLIGHT) break;
			model.errands.set(name, now);
		}
	}

	const next: Record<string, FrameState> = {};
	const refreshCaptures: Array<{ frame: string; overdue: boolean }> = [];
	let changed = false;
	for (const { frame, current, intent, debt, overdue } of entries) {
		const name = frame.name;
		const target: FrameState = intent ?? (model.errands.has(name) ? "refreshing" : "picture");
		// The photograph is the errand's whole point, taken the moment the
		// borrowed document has run long enough to be worth one — or, past
		// CAPTURE_MAX_STALE_MS, the moment it merely holds one (#215).
		if (intent === null && target === "refreshing" && debt && model.arrived.has(name) && !capturing.has(name)) {
			refreshCaptures.push({ frame: name, overdue });
		}
		next[name] = target;
		if (target !== current) changed = true;
	}

	// Frames that left take their bookkeeping with them, and what "left" means
	// depends on what is being remembered. A borrowed frame, a boot that has run
	// long enough, a document you went inside: those are facts about a mounted
	// document, and leaving the page ends them — a page switch must hand its
	// errand slots straight over to the page arriving.
	for (const name of [...model.arrived]) if (!alive.has(name)) model.arrived.delete(name);
	for (const name of [...model.errands.keys()]) if (!alive.has(name)) model.errands.delete(name);
	for (const name of [...model.modelLive]) if (!alive.has(name)) model.modelLive.delete(name);
	for (const name of [...model.wentInside]) if (!alive.has(name)) model.wentInside.delete(name);
	// The debt is not. A frame is owed a picture whether or not its page is the
	// one on screen, so it is pruned against the project: an agent's edit to a
	// frame on another page would otherwise lose its stale mark inside one sweep,
	// and you would go back to a picture of the document as it was with nobody
	// owing you a new one.
	const carried = input.projection ?? alive;
	for (const name of [...model.stale]) if (!carried.has(name)) model.stale.delete(name);
	for (const name of [...model.staleSince.keys()]) if (!carried.has(name)) model.staleSince.delete(name);
	for (const name of [...model.photographed]) if (!carried.has(name)) model.photographed.delete(name);
	for (const name of [...model.tries.keys()]) if (!carried.has(name)) model.tries.delete(name);

	return {
		states: next,
		changed: changed || Object.keys(states).length !== frames.length,
		refreshCaptures,
	};
}

const NOTHING: ReadonlySet<string> = new Set<string>();

/** Whether the mounted document has been allowed to run. Held HTML runs behind its still. */
const running = (state: FrameState, kind: ProjectedFrame["kind"]): boolean =>
	state === "live" || state === "refreshing" || (state === "held" && kind === "html");

/**
 * Every frame that gave up on its picture may ask again.
 *
 * The give-up count answers "can this frame be photographed at all", and a
 * hidden tab makes it answer something else: the timers an errand rides on are
 * throttled to a crawl there, so three tries can be spent without the frame
 * ever having had a fair one. Anything that says the conditions have changed —
 * the tab being looked at again — is worth another go, and the bound is still
 * the bound the moment it is spent under it.
 */
export function renewPictureDebt(model: LifecycleModel): void {
	model.tries.clear();
}

/** Something changed about the frame: its picture is wrong, and it may ask again. */
function markPictureWrong(model: LifecycleModel, frame: string): void {
	model.stale.add(frame);
	model.photographed.delete(frame);
	model.tries.delete(frame);
}

export interface LifecycleDeps {
	framesRef: RefObject<ProjectedFrame[]>;
	/**
	 * The whole projection, for the sweep's pruning (#39): `framesRef` is the page
	 * on screen, and what a frame elsewhere is owed has to outlive not being on it.
	 */
	allFramesRef: RefObject<ProjectedFrame[]>;
	entered: string | null;
	selectionTargets: ReadonlySet<string>;
	/**
	 * The whole frame selection, which keeps those frames awake (#172) and
	 * nothing else. `selectionTargets` is intent, not the selection — the one
	 * frame Select mounts for, and nothing at all in another tool — while three
	 * frames picked to compare are three frames somebody is using, whichever
	 * tool is up.
	 */
	selected: readonly string[];
	/**
	 * The frame under the pointer, which keeps it awake (#172) and nothing else.
	 * Hover is not a mount cause: a frame is already live before you can point at
	 * it, and pointing at a picture has never been worth a document.
	 */
	hovered: string | null;
	hasCover: (frame: string) => boolean;
	onShot: (frame: string, image: CoverRaster) => void;
	/**
	 * Where the camera rests, read by the sweep.
	 *
	 * A ref rather than a value, and deliberately not urgent: a camera moves every
	 * frame of a gesture, and mounting on each one would mount and discard
	 * documents all the way through a pan. Canvas invokes the sweep after the
	 * camera settles, so what mounts is where it came to rest.
	 */
	cameraRef: RefObject<Camera | null>;
	/** The viewport element, for its CSS size. */
	viewportRef: RefObject<HTMLElement | null>;
	/** Whether every frame is back to its picture beneath inline play (#210). */
	pictured: boolean;
}

export function useFrameLifecycle(deps: LifecycleDeps) {
	const {
		framesRef,
		allFramesRef,
		entered,
		selectionTargets,
		selected,
		hovered,
		hasCover,
		onShot,
		cameraRef,
		viewportRef,
		pictured,
	} = deps;

	const [states, setStates] = useState<Record<string, FrameState>>({});
	// when each frame reported loaded, not merely that it did: a still is only
	// worth taking once the frame has had time to finish arriving
	const [ready, setReady] = useState<ReadonlyMap<string, number>>(new Map<string, number>());

	const statesRef = useRef(states);
	statesRef.current = states;
	const readyRef = useRef(ready);
	readyRef.current = ready;
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const selectionTargetsRef = useRef(selectionTargets);
	selectionTargetsRef.current = selectionTargets;
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const hoveredRef = useRef(hovered);
	hoveredRef.current = hovered;
	const picturedRef = useRef(pictured);
	picturedRef.current = pictured;
	const hasCoverRef = useRef(hasCover);
	hasCoverRef.current = hasCover;
	const onShotRef = useRef(onShot);
	onShotRef.current = onShot;

	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const model = useRef(createLifecycleModel());
	const exportFrame = useRef<string | null>(null);
	const exportMountWaiter = useRef<{
		frame: string;
		resolve: (ready: boolean) => void;
		timeout: ReturnType<typeof setTimeout>;
	} | null>(null);
	interface PendingCapture {
		id: string;
		targetWidth: number;
		sourceWindow: WindowProxy;
		resolve: (image: CoverRaster | undefined) => void;
		timeout: ReturnType<typeof setTimeout>;
		rasterStarted: boolean;
		sourceReturned: Promise<boolean>;
		resolveSourceReturned: (returned: boolean) => void;
		abort: AbortController;
	}
	const captureWaiters = useRef(new Map<string, PendingCapture>());
	/** The frames currently told to hold their animations. */
	const frozen = useRef(new Set<string>());
	const cameraMoving = useRef(false);
	/**
	 * When each live frame was last attended, for the idle freeze (#172). A frame
	 * that is not live keeps no clock: it is either showing a picture or running
	 * behind one for a reason of its own, and coming back to live starts the
	 * minute over — a document that just arrived has never been idle.
	 */
	const attendedAt = useRef(new Map<string, number>());

	/**
	 * Freeze is a message to one document, never a render: the shells are memo'd
	 * hard against exactly this (frame-shell.tsx), and a gesture that re-rendered
	 * them would reload every iframe it touched.
	 */
	const postFreeze = useCallback((frame: string, on: boolean) => {
		const sourceWindow = iframes.current.get(frame)?.contentWindow;
		// a document that left took its freeze with it
		if (sourceWindow == null) {
			frozen.current.delete(frame);
			return;
		}
		if (frozen.current.has(frame) === on) return;
		sourceWindow.postMessage(freezeMessage(on), "*");
		if (on) frozen.current.add(frame);
		else frozen.current.delete(frame);
	}, []);

	/**
	 * Roll the idle clocks forward and tell each frame where that leaves it. Runs
	 * on every sweep, because idleness is the one cause that arrives by itself:
	 * the camera stopping and the pointer leaving are both events, but the minute
	 * after them passes without anybody sending anything.
	 */
	const applyFreeze = useCallback(
		(states: Readonly<Record<string, FrameState>> = statesRef.current, now = performance.now()) => {
			const entered = enteredRef.current;
			const alive = new Set<string>();
			for (const frame of framesRef.current) {
				// a terminal's freeze is the daemon's SIGSTOP, sent by its shell
				if (frame.kind !== "html") continue;
				const name = frame.name;
				alive.add(name);
				const state = states[name];
				if (state !== "live") attendedAt.current.delete(name);
				else if (
					!attendedAt.current.has(name) ||
					isFrameAttended({
						cameraMoving: cameraMoving.current,
						entered: entered === name,
						// picked-in or picked-through: the frames you chose, and the one
						// Select is holding open for an element inside it
						selected: selectedRef.current.includes(name) || selectionTargetsRef.current.has(name),
						hovered: hoveredRef.current === name,
					})
				) {
					attendedAt.current.set(name, now);
				}
				postFreeze(
					name,
					FREEZE_ENABLED &&
						isFrameFrozen({
							cameraMoving: cameraMoving.current,
							idleMs: now - (attendedAt.current.get(name) ?? now),
							state,
							entered: entered === name,
							capturing: captureWaiters.current.has(name),
						}),
				);
			}
			// frames that left the projection take their clock with them
			for (const name of [...attendedAt.current.keys()]) if (!alive.has(name)) attendedAt.current.delete(name);
		},
		[framesRef, postFreeze],
	);

	/** The camera started or stopped moving — the canvas already detects both. */
	const noteCameraMoving = useCallback(
		(moving: boolean) => {
			if (cameraMoving.current === moving) return;
			cameraMoving.current = moving;
			// Coming to rest is the last thing anybody did, so every frame's minute
			// runs from the settle. The motion itself is attention too, but only
			// this says so at the instant it ends: the sweep that would otherwise
			// notice is up to 300ms late, and it is the settle a person is timed
			// from, not the last tick of the gesture before it.
			if (!moving) attendedAt.current.clear();
			applyFreeze();
		},
		[applyFreeze],
	);

	const finishExportMount = useCallback((frame: string, ready: boolean) => {
		const waiter = exportMountWaiter.current;
		if (waiter?.frame !== frame) return;
		clearTimeout(waiter.timeout);
		exportMountWaiter.current = null;
		waiter.resolve(ready);
	}, []);

	/** Resolve exactly the request that produced this shot; stale work cannot satisfy its successor. */
	const noteShot = useCallback((frame: string, id: string, image: CoverRaster | undefined) => {
		const pending = captureWaiters.current.get(frame);
		if (pending?.id !== id) return;
		clearTimeout(pending.timeout);
		captureWaiters.current.delete(frame);
		pending.resolveSourceReturned(false);
		pending.abort.abort();
		pending.resolve(image);
		// Full-resolution PNG is an export artifact, never a replacement cover.
		if (image !== undefined && pending.targetWidth > 0) onShotRef.current(frame, image);
	}, []);

	const onIframe = useCallback(
		(frame: string, el: HTMLIFrameElement | null) => {
			const current = iframes.current.get(frame);
			// A fresh document is never frozen — the message went to the old one —
			// and its minute starts here. A source edit lands as a fresh document,
			// and a frame that boots straight into a freeze is one that shows you
			// half of its own arrival for as long as you leave it (#172).
			if (current !== el) {
				frozen.current.delete(frame);
				attendedAt.current.delete(frame);
			}
			if (current !== undefined && current !== el) {
				const pending = captureWaiters.current.get(frame);
				if (pending !== undefined) noteShot(frame, pending.id, undefined);
			}
			if (el !== null) {
				iframes.current.set(frame, el);
				return;
			}
			iframes.current.delete(frame);
			// unmount (or reload) drops the boot: the cover returns until the next loaded report
			setReady((current) => {
				if (!current.has(frame)) return current;
				const next = new Map(current);
				next.delete(frame);
				return next;
			});
		},
		[noteShot],
	);

	/** The frame's loaded report (commit-time effect, #17) — routed in by the canvas's message listener. */
	const noteLoaded = useCallback((frame: string) => {
		if (!readyRef.current.has(frame)) {
			const next = new Map(readyRef.current).set(frame, performance.now());
			readyRef.current = next;
			setReady(next);
		}
	}, []);

	/**
	 * Accept a source only from the current window that received this exact
	 * request, then launch one raster. Canvas performs the same WindowProxy
	 * ownership check before routing here; retaining it here binds completion
	 * to the document that was current when capture began.
	 */
	const noteCaptureSource = useCallback(
		(message: CaptureSourceReply, source: MessageEventSource | null) => {
			const pending = captureWaiters.current.get(message.frame);
			if (
				pending === undefined ||
				pending.id !== message.id ||
				pending.sourceWindow !== source ||
				iframes.current.get(message.frame)?.contentWindow !== source
			) {
				return;
			}
			pending.resolveSourceReturned(true);
			if ("error" in message) {
				noteShot(message.frame, message.id, undefined);
				return;
			}
			if (pending.targetWidth !== message.targetWidth || pending.rasterStarted) return;
			pending.rasterStarted = true;
			void rasterCaptureSource(
				{ ...message, targetWidth: pending.targetWidth },
				captureOrigin,
				pending.abort.signal,
			).then(
				(image) => noteShot(message.frame, message.id, image),
				() => noteShot(message.frame, message.id, undefined),
			);
		},
		[noteShot],
	);

	/**
	 * Ask the frame's shim for one still sharp at the live threshold (or a
	 * full-resolution lossless export when the target is zero).
	 */
	const requestCapture = useCallback(
		(
			frame: string,
			targetWidth = LIVE_MIN_CSS_PX,
			settleMs = CAPTURE_SETTLE_BUDGET_MS,
		): Promise<CoverRaster | undefined> => {
			if (targetWidth !== 0 && targetWidth !== LIVE_MIN_CSS_PX) return Promise.resolve(undefined);
			const el = iframes.current.get(frame);
			const sourceWindow = el?.contentWindow;
			if (sourceWindow == null || !readyRef.current.has(frame)) return Promise.resolve(undefined);
			const pending = captureWaiters.current.get(frame);
			if (pending !== undefined) return Promise.resolve(undefined);
			return new Promise((resolve) => {
				const id = captureRequestId();
				let resolveSourceReturned!: (returned: boolean) => void;
				const sourceReturned = new Promise<boolean>((sourceResolve) => {
					resolveSourceReturned = sourceResolve;
				});
				const timeout = setTimeout(() => noteShot(frame, id, undefined), CAPTURE_REPLY_TIMEOUT_MS + settleMs);
				captureWaiters.current.set(frame, {
					id,
					targetWidth,
					sourceWindow,
					resolve,
					timeout,
					rasterStarted: false,
					sourceReturned,
					resolveSourceReturned,
					abort: new AbortController(),
				});
				// The capture settles on this frame's own rAF and animations, so a
				// frozen one would photograph itself held. Both messages ride the same
				// channel to the same document, so the thaw cannot arrive second.
				postFreeze(frame, false);
				sourceWindow.postMessage(captureMessage(id, targetWidth, settleMs), "*");
			});
		},
		[noteShot, postFreeze],
	);

	useEffect(
		() => () => {
			for (const [frame, pending] of [...captureWaiters.current]) noteShot(frame, pending.id, undefined);
		},
		[noteShot],
	);

	// The decision function: runs on a sweep interval and urgent intent changes.
	const compute = useCallback(() => {
		const now = performance.now();
		const result = sweepLifecycle(model.current, {
			frames: framesRef.current,
			entered: enteredRef.current,
			selectionTargets: selectionTargetsRef.current,
			held: exportFrame.current,
			states: statesRef.current,
			ready: readyRef.current,
			capturing: new Set(captureWaiters.current.keys()),
			hasCover: hasCoverRef.current,
			now,
			camera: cameraRef.current,
			viewport:
				viewportRef.current === null
					? null
					: { width: viewportRef.current.clientWidth, height: viewportRef.current.clientHeight },
			pictured: picturedRef.current,
			projection: new Set(allFramesRef.current.map((frame) => frame.name)),
		});
		for (const { frame, overdue } of result.refreshCaptures) {
			// Overdue skips the settle budget outright: it has to land before the
			// next write retires it, not draw out its own picture first (#215).
			void requestCapture(frame, LIVE_MIN_CSS_PX, overdue ? 0 : CAPTURE_SETTLE_BUDGET_MS).then((image) =>
				noteErrandShot(model.current, frame, image !== undefined),
			);
		}
		if (result.changed) setStates(result.states);
		// against the states this sweep just decided, not last render's: a frame
		// handed back from an errand becomes freezable as soon as it is live again
		applyFreeze(result.states, now);
	}, [framesRef, allFramesRef, cameraRef, viewportRef, requestCapture, applyFreeze]);

	/**
	 * Hold one HTML frame through the export intent, wait for its document,
	 * capture a full-resolution PNG, then hand the document back.
	 */
	const captureExport = useCallback(
		async (frame: string): Promise<CoverRaster | undefined> => {
			if (
				exportFrame.current !== null ||
				!framesRef.current.some((candidate) => candidate.name === frame && candidate.kind === "html")
			) {
				return undefined;
			}

			exportFrame.current = frame;
			const coverCapture = captureWaiters.current.get(frame);
			let mountPromise: Promise<boolean> | undefined;
			if (
				!isExportMountReady(
					statesRef.current[frame],
					readyRef.current.has(frame),
					iframes.current.get(frame)?.contentWindow,
				)
			) {
				mountPromise = new Promise((resolve) => {
					const timeout = setTimeout(() => finishExportMount(frame, false), EXPORT_MOUNT_TIMEOUT_MS);
					exportMountWaiter.current = { frame, resolve, timeout };
				});
			}
			compute();

			try {
				// Let the frame return its cover source before export takes its one
				// capture slot; then only the host-side raster is superseded.
				if (coverCapture?.targetWidth === LIVE_MIN_CSS_PX) {
					if (!(await coverCapture.sourceReturned)) return undefined;
					if (captureWaiters.current.get(frame)?.id === coverCapture.id) {
						noteShot(frame, coverCapture.id, undefined);
					}
				}
				if (mountPromise !== undefined && !(await mountPromise)) return undefined;
				return await requestCapture(frame, 0);
			} finally {
				finishExportMount(frame, false);
				if (exportFrame.current === frame) exportFrame.current = null;
				compute();
			}
		},
		[compute, finishExportMount, framesRef, noteShot, requestCapture],
	);

	useEffect(() => {
		const waiter = exportMountWaiter.current;
		if (
			waiter !== null &&
			isExportMountReady(
				states[waiter.frame],
				ready.has(waiter.frame),
				iframes.current.get(waiter.frame)?.contentWindow,
			)
		) {
			finishExportMount(waiter.frame, true);
		}
	}, [finishExportMount, ready, states]);

	useEffect(
		() => () => {
			const waiter = exportMountWaiter.current;
			if (waiter !== null) finishExportMount(waiter.frame, false);
		},
		[finishExportMount],
	);

	// Selection and entering must feel instant, not one sweep late.
	useEffect(() => {
		enteredRef.current = entered;
		selectionTargetsRef.current = selectionTargets;
		compute();
	}, [entered, selectionTargets, compute]);

	// So must the wake: a frozen frame you point at or pick animates now, not up
	// to a sweep later. This is the freeze alone, never a sweep — neither the
	// pointer nor a selection the current tool ignores mounts anything.
	useEffect(() => {
		hoveredRef.current = hovered;
		selectedRef.current = selected;
		applyFreeze();
	}, [hovered, selected, applyFreeze]);

	useEffect(() => {
		const sweep = setInterval(compute, SWEEP_MS);
		return () => clearInterval(sweep);
	}, [compute]);

	/** A source edit made this frame's cover stale (#22: SSE-live updates). */
	const markStale = useCallback((frame: string) => {
		markPictureWrong(model.current, frame);
	}, []);

	/**
	 * The tab is being looked at again.
	 *
	 * Two things are wrong with what a hidden tab left behind, and both of them
	 * are about the tab rather than about any frame. A background tab throttles
	 * the timers an errand rides on, so a frame that spent its three tries in one
	 * was never given a fair go and would otherwise never ask again; the count
	 * goes back to nothing and the owed pictures are taken now. And nothing had
	 * attended anything for however long the tab was away, so every live frame is
	 * frozen — coming back is itself the attention, the way settling a camera is,
	 * so the minute starts here rather than on the first thing you touch.
	 */
	const wake = useCallback(() => {
		renewPictureDebt(model.current);
		attendedAt.current.clear();
		compute();
	}, [compute]);

	return {
		states,
		ready,
		onIframe,
		noteLoaded,
		noteCaptureSource,
		noteCameraMoving,
		markStale,
		wake,
		capture: requestCapture,
		captureExport,
		sweep: compute,
	};
}
