import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_MIN_CSS_PX } from "../../cover";
import { type Camera, captureOrigin, type ProjectedFrame } from "../api";
import { intersects } from "./camera";
import { CAPTURE_WORKER_TIMEOUT_MS, type CoverRaster, captureRequestId, rasterCaptureSource } from "./capture-broker";
import { type CaptureSourceReply, captureMessage } from "./protocol";

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
 * and 3 are the same errand — borrow the frame long enough to photograph it —
 * and the sweep hands it out a couple at a time.
 *
 * Intent holds a document too, one frame at a time and never a pool: the
 * selection target and the frame an open inspector rail reads (#58) both need
 * real DOM to answer picks and tree walks. A readable selected HTML frame stays
 * live; an unreadable one stays held behind its still and keeps running.
 *
 * A picture stands in below the readable threshold. Above it, a nearby frame
 * is live; a borrowed or held frame remains behind its still.
 *
 * HTML documents keep running: Select leaves a readable one live, and an
 * unreadable held one runs behind its still. A terminal's held state sends
 * SIGSTOP to its real process (`daemon/term-sessions.ts`).
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
 * `globalThis.__spoolBench` is `{ errands }` — the cap, unbounded at 0 or
 * below. Read once at module load, because playwright's init script runs before
 * this bundle evaluates and nothing else ever writes it, so an unset hook
 * leaves the sweep comparing against the same constant it always did.
 *
 * It folds into the exported cap rather than shadowing it, so the sweep and
 * every test read the one number the decision actually uses. It lives only
 * while that cap is a constant; if the canvas ever derives it, this goes too.
 */
const benchErrands = (globalThis as unknown as { __spoolBench?: { errands?: number } }).__spoolBench?.errands;
export const ERRANDS_IN_FLIGHT =
	benchErrands === undefined ? SHIPPED_ERRANDS_IN_FLIGHT : benchErrands > 0 ? benchErrands : Number.POSITIVE_INFINITY;
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
	/** Frames that have run long enough since booting to be worth photographing. */
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
	/** The one frame Select currently owns: mounted for the selection. */
	selectionTarget: string | null;
	/** The frame an open inspector rail is reading (#58): mounted so it can answer. */
	inspected: string | null;
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

export interface SweepResult {
	states: Record<string, FrameState>;
	changed: boolean;
	/** Borrowed frames that have run long enough to be worth photographing now. */
	refreshCaptures: string[];
}

export function sweepLifecycle(model: LifecycleModel, input: SweepInput): SweepResult {
	const { frames, entered, selectionTarget, inspected, states, ready, capturing, hasCover, now, camera, viewport } =
		input;
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
		if (modelLive && selectionTarget !== name && entered !== name && !model.wentInside.has(name)) {
			model.modelLive.add(name);
		}
		let intent: FrameState | null;
		if (selectionTarget === name && frame.kind === "html" && modelLive) {
			intent = "live";
		} else if (selectionTarget === name) {
			intent = "held";
		} else if (entered === name || modelLive) {
			intent = "live";
		} else if (inspected === name) {
			intent = "held";
		} else {
			intent = null;
		}

		// A still is only worth what the frame was doing when it was taken. A
		// frame that booted a moment ago is still arriving, and one that never
		// ran never arrived at all — both photograph as an absence, and the
		// canvas would then show that absence in the frame's own place. Having
		// run long enough once is remembered, and a reload takes the memory with
		// the boot.
		const readyAt = ready.get(name);
		if (readyAt === undefined) model.arrived.delete(name);
		else if (running(current, frame.kind) && now - readyAt >= CAPTURE_AFTER_READY_MS && !model.arrived.has(name)) {
			model.arrived.add(name);
		}

		// A frame you were inside ran, and what it showed while it ran is not
		// what its still records — leaving it is a change like any other.
		// Zooming past a frame is not using it, and a still of a freshly booted
		// frame is still true of the frame that just booted and did nothing.
		if (current === "live" && intent !== "live" && frame.kind !== "term" && !wasModelLive.has(name)) {
			markPictureWrong(model, name);
			model.wentInside.delete(name);
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

		entries.push({ frame, current, intent, debt });
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
	const refreshCaptures: string[] = [];
	let changed = false;
	for (const { frame, current, intent, debt } of entries) {
		const name = frame.name;
		const target: FrameState = intent ?? (model.errands.has(name) ? "refreshing" : "picture");
		// The photograph is the errand's whole point, taken the moment the
		// borrowed document has run long enough to be worth one.
		if (intent === null && target === "refreshing" && debt && model.arrived.has(name) && !capturing.has(name)) {
			refreshCaptures.push(name);
		}
		next[name] = target;
		if (target !== current) changed = true;
	}

	// Frames that left the projection take their bookkeeping with them.
	for (const name of [...model.stale]) if (!alive.has(name)) model.stale.delete(name);
	for (const name of [...model.arrived]) if (!alive.has(name)) model.arrived.delete(name);
	for (const name of [...model.photographed]) if (!alive.has(name)) model.photographed.delete(name);
	for (const name of [...model.errands.keys()]) if (!alive.has(name)) model.errands.delete(name);
	for (const name of [...model.tries.keys()]) if (!alive.has(name)) model.tries.delete(name);
	for (const name of [...model.modelLive]) if (!alive.has(name)) model.modelLive.delete(name);
	for (const name of [...model.wentInside]) if (!alive.has(name)) model.wentInside.delete(name);

	return {
		states: next,
		changed: changed || Object.keys(states).length !== frames.length,
		refreshCaptures,
	};
}

/** Whether the mounted document has been allowed to run. Held HTML runs behind its still. */
const running = (state: FrameState, kind: ProjectedFrame["kind"]): boolean =>
	state === "live" || state === "refreshing" || (state === "held" && kind === "html");

/** Something changed about the frame: its picture is wrong, and it may ask again. */
function markPictureWrong(model: LifecycleModel, frame: string): void {
	model.stale.add(frame);
	model.photographed.delete(frame);
	model.tries.delete(frame);
}

export interface LifecycleDeps {
	framesRef: RefObject<ProjectedFrame[]>;
	entered: string | null;
	selectionTarget: string | null;
	/** The frame an open inspector rail is reading (#58). */
	inspected: string | null;
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
}

export function useFrameLifecycle(deps: LifecycleDeps) {
	const { framesRef, entered, selectionTarget, inspected, hasCover, onShot, cameraRef, viewportRef } = deps;

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
	const selectionTargetRef = useRef(selectionTarget);
	selectionTargetRef.current = selectionTarget;
	const inspectedRef = useRef(inspected);
	inspectedRef.current = inspected;
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
				sourceWindow.postMessage(captureMessage(id, targetWidth, settleMs), "*");
			});
		},
		[noteShot],
	);

	useEffect(
		() => () => {
			for (const [frame, pending] of [...captureWaiters.current]) noteShot(frame, pending.id, undefined);
		},
		[noteShot],
	);

	// The decision function: runs on a sweep interval and urgent intent changes.
	const compute = useCallback(() => {
		const result = sweepLifecycle(model.current, {
			frames: framesRef.current,
			entered: enteredRef.current,
			selectionTarget: selectionTargetRef.current,
			inspected: exportFrame.current ?? inspectedRef.current,
			states: statesRef.current,
			ready: readyRef.current,
			capturing: new Set(captureWaiters.current.keys()),
			hasCover: hasCoverRef.current,
			now: performance.now(),
			camera: cameraRef.current,
			viewport:
				viewportRef.current === null
					? null
					: { width: viewportRef.current.clientWidth, height: viewportRef.current.clientHeight },
		});
		for (const frame of result.refreshCaptures) {
			void requestCapture(frame).then((image) => noteErrandShot(model.current, frame, image !== undefined));
		}
		if (result.changed) setStates(result.states);
	}, [framesRef, cameraRef, viewportRef, requestCapture]);

	/**
	 * Hold one HTML frame through the inspector intent, wait for its document,
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

	// Selection, entering, and summoning the rail must feel instant, not one sweep late.
	useEffect(() => {
		enteredRef.current = entered;
		selectionTargetRef.current = selectionTarget;
		inspectedRef.current = inspected;
		compute();
	}, [entered, selectionTarget, inspected, compute]);

	useEffect(() => {
		const sweep = setInterval(compute, SWEEP_MS);
		return () => clearInterval(sweep);
	}, [compute]);

	/** A source edit made this frame's cover stale (#22: SSE-live updates). */
	const markStale = useCallback((frame: string) => {
		markPictureWrong(model.current, frame);
	}, []);

	return {
		states,
		ready,
		onIframe,
		noteLoaded,
		noteCaptureSource,
		markStale,
		capture: requestCapture,
		captureExport,
		sweep: compute,
	};
}
