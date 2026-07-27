import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COVER_MAX_EDGE } from "../../cover";
import { captureOrigin, type ProjectedFrame } from "../api";
import { CAPTURE_WORKER_TIMEOUT_MS, type CoverRaster, captureRequestId, rasterCaptureSource } from "./capture-broker";
import { type CaptureSourceReply, captureMessage } from "./protocol";

/**
 * The engine lifecycle (#8, #13, #40, #54, #112): which frames hold a document,
 * and why. Mounting is caused, never scheduled — three causes and no others:
 *
 *   1. you went inside a frame,
 *   2. its picture is missing,
 *   3. its picture is wrong.
 *
 * Being on screen is not one of them. A picture already gives panning
 * everything it needs, so panning across thirty frames mounts nothing and the
 * document count is flat in frame count and in zoom: one typically, six at
 * worst. Causes 2 and 3 are the same errand — borrow the frame long enough to
 * photograph it — and the sweep hands it out a couple at a time.
 *
 * Intent holds a document too, one frame at a time and never a pool: the frozen
 * selection target and the frame an open inspector rail reads (#58) both need
 * real DOM to answer picks and tree walks, and both are held with their time
 * stopped.
 *
 * The picture is the only thing anyone looks at. The frame you went inside runs
 * and is seen; every other document sits behind that frame's own still, held or
 * booting out of sight, and the still is what the canvas draws at every zoom —
 * which is what the cover ladder (#111) exists to stay sharp for.
 *
 * Freezing is `content-visibility: hidden` on the frame's own wrapper, applied
 * by the shell once the boot lands: Chromium stops the nested document's rAF,
 * style, layout and paint at engine level, with no cross-origin condition
 * (#84). There is no cooperative freeze left for html frames — one mechanism
 * ships, not two. A terminal's freeze is a different mechanism wearing the same
 * word (SIGSTOP on a real process, `daemon/term-sessions.ts`) and no CSS can
 * reach it, so the message survives for terminals alone.
 */

export type FrameState = "picture" | "refreshing" | "held" | "live";

const SWEEP_MS = 300;
/**
 * How long a whole self-capture may take: the shim's serialization, the hops
 * between three realms, and the worker's own ladder budget. It has to outlast
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
 * carries. `bench/mount-gesture.ts`'s canvas arm sweeps the cap above and below
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
}

export function createLifecycleModel(): LifecycleModel {
	return {
		stale: new Set(),
		arrived: new Set(),
		errands: new Map(),
		photographed: new Set(),
		tries: new Map(),
	};
}

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
	/** The one frame currently selected into: mounted with time frozen. */
	frozen: string | null;
	/** The frame an open inspector rail is reading (#58): mounted so it can answer. */
	inspected: string | null;
	states: Readonly<Record<string, FrameState>>;
	/** Frames whose boot has reported loaded, and when — the ones a capture can reach. */
	ready: ReadonlyMap<string, number>;
	/** Frames with a capture already in flight. */
	capturing: ReadonlySet<string>;
	hasCover: (frame: string) => boolean;
	now: number;
}

export interface SweepResult {
	states: Record<string, FrameState>;
	changed: boolean;
	/** Borrowed frames that have run long enough to be worth photographing now. */
	refreshCaptures: string[];
}

export function sweepLifecycle(model: LifecycleModel, input: SweepInput): SweepResult {
	const { frames, entered, frozen, inspected, states, ready, capturing, hasCover, now } = input;

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
		// Freezing wins over entering: holding the platform modifier over the
		// frame you are inside takes the pointer back to reach an element, and
		// the frame must not move under it.
		const intent = frozen === name ? "held" : entered === name ? "live" : inspected === name ? "held" : null;

		// A still is only worth what the frame was doing when it was taken. A
		// frame that booted a moment ago is still arriving, and one that never
		// ran never arrived at all — both photograph as an absence, and the
		// canvas would then show that absence in the frame's own place. Having
		// run long enough once is remembered: a frame frozen mid-entry never
		// becomes photographable, and a reload takes the memory with the boot.
		const readyAt = ready.get(name);
		if (readyAt === undefined) model.arrived.delete(name);
		else if (running(current) && now - readyAt >= CAPTURE_AFTER_READY_MS && !model.arrived.has(name)) {
			model.arrived.add(name);
		}

		// A frame you were inside ran, and what it showed while it ran is not
		// what its still records — leaving it is a change like any other.
		if (current === "live" && intent !== "live" && frame.kind !== "term") markPictureWrong(model, name);

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
		if (target === "refreshing" && debt && model.arrived.has(name) && !capturing.has(name)) {
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

	return {
		states: next,
		changed: changed || Object.keys(states).length !== frames.length,
		refreshCaptures,
	};
}

/** Whether a state means the frame's own time is running. */
const running = (state: FrameState): boolean => state === "live" || state === "refreshing";

/** Something changed about the frame: its picture is wrong, and it may ask again. */
function markPictureWrong(model: LifecycleModel, frame: string): void {
	model.stale.add(frame);
	model.photographed.delete(frame);
	model.tries.delete(frame);
}

export interface LifecycleDeps {
	framesRef: RefObject<ProjectedFrame[]>;
	entered: string | null;
	frozen: string | null;
	/** The frame an open inspector rail is reading (#58). */
	inspected: string | null;
	hasCover: (frame: string) => boolean;
	onShot: (frame: string, rungs: CoverRaster[]) => void;
}

export function useFrameLifecycle(deps: LifecycleDeps) {
	const { framesRef, entered, frozen, inspected, hasCover, onShot } = deps;

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
	const frozenRef = useRef(frozen);
	frozenRef.current = frozen;
	const inspectedRef = useRef(inspected);
	inspectedRef.current = inspected;
	const hasCoverRef = useRef(hasCover);
	hasCoverRef.current = hasCover;
	const onShotRef = useRef(onShot);
	onShotRef.current = onShot;

	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const model = useRef(createLifecycleModel());
	interface PendingCapture {
		id: string;
		maxEdge: number;
		sourceWindow: WindowProxy;
		resolve: (rungs: CoverRaster[] | undefined) => void;
		timeout: ReturnType<typeof setTimeout>;
		rasterStarted: boolean;
		abort: AbortController;
	}
	const captureWaiters = useRef(new Map<string, PendingCapture>());

	/** Resolve exactly the request that produced this shot; stale work cannot satisfy its successor. */
	const noteShot = useCallback((frame: string, id: string, rungs: CoverRaster[] | undefined) => {
		const pending = captureWaiters.current.get(frame);
		if (pending?.id !== id) return;
		clearTimeout(pending.timeout);
		captureWaiters.current.delete(frame);
		pending.abort.abort();
		pending.resolve(rungs);
		// Full-resolution PNG is an export artifact, never a replacement cover.
		if (rungs !== undefined && pending.maxEdge > 0) onShotRef.current(frame, rungs);
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
		setReady((current) => (current.has(frame) ? current : new Map(current).set(frame, performance.now())));
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
			if ("error" in message) {
				noteShot(message.frame, message.id, undefined);
				return;
			}
			if (pending.maxEdge !== message.maxEdge || pending.rasterStarted) return;
			pending.rasterStarted = true;
			void rasterCaptureSource({ ...message, maxEdge: pending.maxEdge }, captureOrigin, pending.abort.signal).then(
				(rungs) => noteShot(message.frame, message.id, rungs),
				() => noteShot(message.frame, message.id, undefined),
			);
		},
		[noteShot],
	);

	/**
	 * Ask the frame's shim for a self-capture whose top rung is bounded to
	 * `maxEdge` device pixels on its longest side (0 for the frame at full
	 * resolution, one rung, lossless), allowing it `settleMs` to finish arriving
	 * before it photographs itself. Resolves every rung the capture host
	 * produced — or undefined for an unmounted, unbooted, already-capturing or
	 * mute frame. A bounded capture persists as the frame's cover ladder; a
	 * full-resolution export returns only to its caller.
	 */
	const requestCapture = useCallback(
		(
			frame: string,
			maxEdge = COVER_MAX_EDGE,
			settleMs = CAPTURE_SETTLE_BUDGET_MS,
		): Promise<CoverRaster[] | undefined> => {
			if (!Number.isSafeInteger(maxEdge) || maxEdge < 0 || maxEdge > 16 * 1024) return Promise.resolve(undefined);
			const el = iframes.current.get(frame);
			const sourceWindow = el?.contentWindow;
			if (sourceWindow == null || !readyRef.current.has(frame)) return Promise.resolve(undefined);
			const pending = captureWaiters.current.get(frame);
			if (pending !== undefined) return Promise.resolve(undefined);
			return new Promise((resolve) => {
				const id = captureRequestId();
				const timeout = setTimeout(() => noteShot(frame, id, undefined), CAPTURE_REPLY_TIMEOUT_MS + settleMs);
				captureWaiters.current.set(frame, {
					id,
					maxEdge,
					sourceWindow,
					resolve,
					timeout,
					rasterStarted: false,
					abort: new AbortController(),
				});
				sourceWindow.postMessage(captureMessage(id, maxEdge, settleMs), "*");
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
			frozen: frozenRef.current,
			inspected: inspectedRef.current,
			states: statesRef.current,
			ready: readyRef.current,
			capturing: new Set(captureWaiters.current.keys()),
			hasCover: hasCoverRef.current,
			now: performance.now(),
		});
		for (const frame of result.refreshCaptures) {
			void requestCapture(frame).then((rungs) => noteErrandShot(model.current, frame, rungs !== undefined));
		}
		if (result.changed) setStates(result.states);
	}, [framesRef, requestCapture]);

	// Freeze, enter, and summoning the rail must feel instant, not one sweep late.
	useEffect(() => {
		enteredRef.current = entered;
		frozenRef.current = frozen;
		inspectedRef.current = inspected;
		compute();
	}, [entered, frozen, inspected, compute]);

	useEffect(() => {
		const sweep = setInterval(compute, SWEEP_MS);
		return () => clearInterval(sweep);
	}, [compute]);

	/** A source edit made this frame's cover stale (#22: SSE-live updates). */
	const markStale = useCallback((frame: string) => {
		markPictureWrong(model.current, frame);
	}, []);

	return { states, ready, onIframe, noteLoaded, noteCaptureSource, markStale, capture: requestCapture };
}
