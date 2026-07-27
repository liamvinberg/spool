import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COVER_MAX_EDGE } from "../../cover";
import { type Camera, captureOrigin, type ProjectedFrame } from "../api";
import { intersects, toWorld, visibleWorldRect } from "./camera";
import { captureRequestId, rasterCaptureSource } from "./capture-broker";
import { type CaptureSourceReply, captureMessage } from "./protocol";

/**
 * The engine lifecycle (#8, #13, #40, #54): which frames run, which stand
 * frozen, which exist only as their still. Near frames play; tiny-rendered,
 * offscreen, and selected-into frames freeze (Chrome free-runs tiny frames at
 * 500+ Hz — the zoom threshold is load-bearing) and stay mounted in the warm
 * pool. K_MIN_MOUNT is that threshold, and it gates both: a frame drawn
 * smaller than its own still is not worth a renderer, so an overview of a
 * large canvas mounts nothing at all.
 * Freezing is never a saving to reach for. A frozen frame's rAF is held, so
 * content that animates itself in never arrives and its still records the
 * absence — which is why only frames you cannot read stop.
 * Hibernation's payoff is memory, never CPU: only pool overflow demotes a
 * frame to its still, oldest-seen first, html frames taking a goodbye
 * self-capture on the way out. Every mount drains through the wake queue —
 * entered immediately, the freeze target and the inspected frame next, then
 * nearest the viewport center, a few per sweep — so no burst site can land every mount in one
 * commit. Stills refresh under the same discipline, so a settling camera never
 * fires a rasterization storm. Hibernation is automatic engine lifecycle,
 * never a tool; entering a hibernated frame boots it fresh, while freezing
 * always keeps its document.
 *
 * A moving camera owns the whole timetable (#80). Mounts wait for it to hold
 * still, because a booting document paints and a paint under a moving camera
 * is the stutter; captures wait for it to settle, and for the frame itself to
 * have finished arriving, because the still they take is what the canvas
 * stands in for that frame every time the camera moves after.
 */

export type FrameState = "live" | "warm" | "hibernated";

/**
 * The zoom past which a frame's still is coarser than the frame itself. A
 * cover is rasterized to at most COVER_MAX_EDGE device pixels on its longest
 * side, and never above 2× — beyond that, standing the still in for the
 * document would visibly soften it, and a swap you can see is the flicker the
 * swap exists to remove. Below it the still is downscaled, which hides its own
 * compression, so the exchange is invisible in both directions.
 */
export function stillSharpUntil(w: number, h: number, devicePixelRatio: number): number {
	const dpr = Math.max(1, devicePixelRatio);
	const edge = Math.max(w, h);
	const captured = Math.min(edge * Math.min(dpr, 2), COVER_MAX_EDGE);
	return captured / (edge * dpr);
}

const MARGIN_FRACTION = 0.5; // extra viewport fractions kept mounted around the screen
/**
 * Below this zoom a frame renders smaller than the still it already has, so
 * real DOM buys nothing and costs a renderer: an overview of a large canvas
 * mounts nothing at all. This gates mounting, never running — running is the
 * entered frame's alone, at any zoom.
 */
const K_MIN_MOUNT = 0.15;
const EXIT_CAPTURE_TIMEOUT_MS = 600; // how long an eviction waits for the goodbye shot
const CAMERA_SETTLE_MS = 400; // capture on settle, never mid-gesture
const SWEEP_MS = 300;
const CAPTURE_REPLY_TIMEOUT_MS = 3000;
/**
 * How long a booted frame runs before its still is worth taking. Frames animate
 * their content in; a capture fired on the loaded report records the frame
 * mid-arrival, and that half-drawn picture is what the canvas then shows in the
 * frame's place while the camera moves. The shim waits for its own animations
 * too — this is the outer bound, for the entry animations no timing API sees.
 */
export const CAPTURE_AFTER_READY_MS = 1500;
/**
 * How long a frame may wait, inside the capture itself, for its fonts to load
 * and its entry animations to finish before it photographs itself. A walk asks
 * for less: its cover is wanted inside the arrival it belongs to.
 */
export const CAPTURE_SETTLE_BUDGET_MS = 900;
export const MOUNTS_PER_SWEEP = 3; // wake-queue drain rate: 3 × ~8 ms ≈ one skipped paint per sweep at worst
export const CAPTURES_PER_SWEEP = 2; // still-refresh drain rate: a self-capture is a whole-document rasterization
export const WARM_POOL_CAP = 24; // offscreen warm frames kept mounted; each holds ~4.6 MB and a renderer

/**
 * The measurement hook (#108), and the only temporary code the canvas carries.
 * `bench/mount-gesture.ts` (#94) has to drive this function into states the
 * shipped canvas will not produce on demand — a gesture with mounting
 * deliberately in flight — and the alternative is a second lifecycle model
 * living in the bench, which is strictly worse. The bench throws rather than
 * running without it: a gesture over a canvas that mounted nothing reads as
 * "mounting is free" for the one reason that proves nothing.
 *
 * `globalThis.__spoolBench` is `{ gate, admit }`. `gate: false` deletes the #80
 * camera gate so mounting no longer waits for a still camera; `admit` is the
 * admissions-per-sweep cap, unbounded at 0 or below. Read once at module load,
 * because playwright's init script runs before this bundle evaluates and
 * nothing else ever writes it — so an unset hook leaves the sweep comparing
 * against the same two constants it always did.
 *
 * #112 deletes the `holding` gate outright and owns removing `gate` in that
 * same diff: there will be no gate left to override. `admit` survives only
 * while the in-flight cap is a constant, and #112 files the follow-up if it
 * outlives that.
 */
const benchHooks = (globalThis as unknown as { __spoolBench?: { gate?: boolean; admit?: number } }).__spoolBench;

/** The #80 camera gate, intact unless a bench asked for it gone. */
const BENCH_GATE = benchHooks?.gate ?? true;

/** Admissions per sweep: the shipped cap, a bench's own, or unbounded at 0 or below. */
const BENCH_ADMIT =
	benchHooks?.admit === undefined
		? MOUNTS_PER_SWEEP
		: benchHooks.admit > 0
			? benchHooks.admit
			: Number.POSITIVE_INFINITY;

/** The decision function's persistent bookkeeping, owned by the hook, fabricated by tests. */
export interface LifecycleModel {
	/** When each frame was last on screen — the warm pool evicts oldest-seen first. */
	lastSeen: Map<string, number>;
	/** Evictions mid-goodbye: the frame stays warm until its capture lands or times out. */
	exitPending: Map<string, { t0: number; captured: boolean }>;
	/** Frames whose still went stale — a source edit, or leaving live. */
	staleStills: Set<string>;
	/** Frames that have run long enough since booting to be worth photographing. */
	arrived: Set<string>;
	prevCamera: Camera | null;
	lastCameraMove: number;
}

export function createLifecycleModel(): LifecycleModel {
	return {
		lastSeen: new Map(),
		exitPending: new Map(),
		staleStills: new Set(),
		arrived: new Set(),
		prevCamera: null,
		lastCameraMove: 0,
	};
}

/** The goodbye shot's outcome — an eviction mid-dance learns whether its capture landed. */
export function noteExitCapture(model: LifecycleModel, frame: string, captured: boolean): void {
	const exit = model.exitPending.get(frame);
	if (exit !== undefined) exit.captured = captured;
}

export interface SweepInput {
	frames: readonly ProjectedFrame[];
	camera: Camera;
	viewportWidth: number;
	viewportHeight: number;
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
	hasThumb: (frame: string) => boolean;
	now: number;
}

export interface SweepResult {
	states: Record<string, FrameState>;
	changed: boolean;
	/** Evicted html frames owed a goodbye capture; route each outcome to noteExitCapture. */
	exitCaptures: string[];
	/** Frames whose still should refresh while their DOM is mounted and settled. */
	refreshCaptures: string[];
}

export function sweepLifecycle(model: LifecycleModel, input: SweepInput): SweepResult {
	const {
		frames,
		camera,
		viewportWidth,
		viewportHeight,
		entered,
		frozen,
		inspected,
		states,
		ready,
		capturing,
		hasThumb,
		now,
	} = input;

	const prev = model.prevCamera;
	const shifted = prev !== null && (prev.x !== camera.x || prev.y !== camera.y || prev.k !== camera.k);
	if (prev === null || shifted) {
		model.prevCamera = { ...camera };
		model.lastCameraMove = now;
	}
	const settled = now - model.lastCameraMove > CAMERA_SETTLE_MS;
	// Mounting waits only for the camera to hold still from one sweep to the
	// next — a booting document paints, and a paint under a moving camera is
	// the stutter. First sight of a camera is not a movement, so a canvas
	// opening mounts straight away.
	const holding = !shifted || !BENCH_GATE;

	const margined = visibleWorldRect(camera, viewportWidth, viewportHeight, MARGIN_FRACTION);
	const strict = visibleWorldRect(camera, viewportWidth, viewportHeight, 0);
	const center = toWorld({ x: viewportWidth / 2, y: viewportHeight / 2 }, camera);

	interface Entry {
		frame: ProjectedFrame;
		current: FrameState;
		/** On screen and rendered big enough that real DOM beats the still. */
		mountable: boolean;
		target: FrameState;
	}
	const entries: Entry[] = [];
	// the wake queue: every mount waits here; strictly-visible frames precede
	// the margin ring, nearest the viewport center first within each tier
	const waiting: { entry: Entry; wakeTo: "live" | "warm"; tier: number; dist: number }[] = [];

	for (const frame of frames) {
		const current = states[frame.name] ?? "hibernated";
		const onScreen = intersects(margined, frame);
		const mountable = onScreen && camera.k >= K_MIN_MOUNT;
		if (mountable) {
			model.lastSeen.set(frame.name, now);
		}
		// Coming back into view or becoming the one frozen intent rescues an
		// eviction mid-goodbye. A freeze must keep the existing document.
		if (mountable || frozen === frame.name || inspected === frame.name) model.exitPending.delete(frame.name);

		// A frame you can read runs. Freezing one that is merely on screen
		// looks like a saving and is not: frames animate their content in, and
		// a shim that holds rAF holds them at the opacity they started from —
		// the text never arrives, and the still captured from that frame
		// records the absence. Time stops where it cannot be seen to stop:
		// offscreen, too small to read, or deliberately frozen to be picked at.
		let target: FrameState;
		let wakeTo: "live" | "warm" | null = null;
		if (current !== "hibernated") {
			target = frozen === frame.name ? "warm" : entered === frame.name || mountable ? "live" : "warm";
		} else if (entered === frame.name && frozen !== frame.name) {
			// entering mounts in its own sweep, bypassing the cap
			target = "live";
		} else {
			target = "hibernated";
			// an open rail is watched intent (#58): its frame mounts even offscreen,
			// or it has no DOM to answer the elements tab with
			wakeTo = frozen === frame.name ? "warm" : mountable ? "live" : inspected === frame.name ? "warm" : null;
		}

		const entry: Entry = { frame, current, mountable, target };
		entries.push(entry);
		if (wakeTo !== null) {
			const cx = frame.x + frame.w / 2 - center.x;
			const cy = frame.y + frame.h / 2 - center.y;
			const tier =
				frozen === frame.name || inspected === frame.name ? 0 : intersects(strict, frame) ? 1 : onScreen ? 2 : 3;
			waiting.push({ entry, wakeTo, tier, dist: cx * cx + cy * cy });
		}
	}

	// The queue holds while the camera moves and drains the sweep after it
	// stops. Entering never queues, so going inside stays instant at any moment.
	waiting.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
	if (holding) for (const admitted of waiting.slice(0, BENCH_ADMIT)) admitted.entry.target = admitted.wakeTo;

	const exitCaptures: string[] = [];
	// resolve in-flight goodbyes: the capture landed or timed out — unmount now
	for (const entry of entries) {
		if (entry.target !== "warm") continue;
		const exit = model.exitPending.get(entry.frame.name);
		if (exit === undefined) continue;
		if (exit.captured || now - exit.t0 >= EXIT_CAPTURE_TIMEOUT_MS) {
			model.exitPending.delete(entry.frame.name);
			entry.target = "hibernated";
		}
	}
	// the warm pool: only overflow hibernates, oldest-seen first — live frames
	// never count, the frozen frame is current intent, and a mid-goodbye frame
	// is already on its way out
	const pool = entries.filter(
		(e) =>
			e.target === "warm" &&
			!e.mountable &&
			e.frame.name !== frozen &&
			e.frame.name !== inspected &&
			!model.exitPending.has(e.frame.name),
	);
	const overflow = pool.length - WARM_POOL_CAP;
	if (overflow > 0) {
		pool.sort((a, b) => (model.lastSeen.get(a.frame.name) ?? 0) - (model.lastSeen.get(b.frame.name) ?? 0));
		for (const evicted of pool.slice(0, overflow)) {
			if (evicted.frame.kind === "term") {
				// a terminal's still is the daemon's grid (#42) — no goodbye capture
				evicted.target = "hibernated";
			} else {
				// one goodbye self-capture while the DOM still exists
				model.exitPending.set(evicted.frame.name, { t0: now, captured: false });
				exitCaptures.push(evicted.frame.name);
			}
		}
	}

	// the refresh queue, drained like the wake queue: nearest the viewport
	// center first, a couple per sweep
	const owed: { name: string; dist: number }[] = [];
	const next: Record<string, FrameState> = {};
	let changed = false;
	for (const { frame, current, target } of entries) {
		// leaving live stales the still; refresh once the camera settles,
		// while the (hidden) DOM is still mounted
		if (current === "live" && target === "warm" && frame.kind !== "term") model.staleStills.add(frame.name);
		// A still is only worth what the frame was doing when it was taken. A
		// frame that booted a moment ago is still arriving, and one that never
		// ran never arrived at all — both photograph as an absence, and the
		// canvas would then show that absence in the frame's own place. Having
		// run long enough once is remembered: an offscreen frame's still stays
		// refreshable, a frame frozen mid-entry never becomes one.
		const readyAt = ready.get(frame.name);
		if (readyAt === undefined) model.arrived.delete(frame.name);
		else if (target === "live" && now - readyAt >= CAPTURE_AFTER_READY_MS && !model.arrived.has(frame.name)) {
			// First arrival is the one moment a still is certainly owed. A stored
			// still is a picture of some earlier render — an older document, an
			// older capture, a frame caught mid-entry — and the canvas is about to
			// stand it in for this one every time the camera moves. One capture
			// per boot, drained like every other, makes the two the same picture.
			model.arrived.add(frame.name);
			model.staleStills.add(frame.name);
		}
		if (
			frame.kind !== "term" &&
			settled &&
			target !== "hibernated" &&
			model.arrived.has(frame.name) &&
			(model.staleStills.has(frame.name) || !hasThumb(frame.name)) &&
			!capturing.has(frame.name) &&
			!model.exitPending.has(frame.name)
		) {
			const cx = frame.x + frame.w / 2 - center.x;
			const cy = frame.y + frame.h / 2 - center.y;
			owed.push({ name: frame.name, dist: cx * cx + cy * cy });
		}
		next[frame.name] = target;
		if (target !== current) changed = true;
	}
	// A self-capture serializes and rasterizes a whole document. Every mounted
	// frame in debt firing into the sweep that follows a settling camera is a
	// stutter exactly where the eye is: the debt is kept, not the burst.
	owed.sort((a, b) => a.dist - b.dist);
	const refreshCaptures = owed.slice(0, CAPTURES_PER_SWEEP).map((entry) => entry.name);
	for (const name of refreshCaptures) model.staleStills.delete(name);
	return {
		states: next,
		changed: changed || Object.keys(states).length !== frames.length,
		exitCaptures,
		refreshCaptures,
	};
}

export interface LifecycleDeps {
	framesRef: RefObject<ProjectedFrame[]>;
	cameraRef: RefObject<Camera | null>;
	viewportRef: RefObject<HTMLDivElement | null>;
	entered: string | null;
	frozen: string | null;
	/** The frame an open inspector rail is reading (#58). */
	inspected: string | null;
	hasThumb: (frame: string) => boolean;
	onShot: (frame: string, dataUrl: string) => void;
}

export function useFrameLifecycle(deps: LifecycleDeps) {
	const { framesRef, cameraRef, viewportRef, entered, frozen, inspected, hasThumb, onShot } = deps;

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
	const hasThumbRef = useRef(hasThumb);
	hasThumbRef.current = hasThumb;
	const onShotRef = useRef(onShot);
	onShotRef.current = onShot;

	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const model = useRef(createLifecycleModel());
	interface PendingCapture {
		id: string;
		maxEdge: number;
		sourceWindow: WindowProxy;
		resolve: (url: string | undefined) => void;
		timeout: ReturnType<typeof setTimeout>;
		rasterStarted: boolean;
		abort: AbortController;
	}
	const captureWaiters = useRef(new Map<string, PendingCapture>());

	/** Resolve exactly the request that produced this shot; stale work cannot satisfy its successor. */
	const noteShot = useCallback((frame: string, id: string, url: string | undefined) => {
		const pending = captureWaiters.current.get(frame);
		if (pending?.id !== id) return;
		clearTimeout(pending.timeout);
		captureWaiters.current.delete(frame);
		pending.abort.abort();
		pending.resolve(url);
		// Full-resolution PNG is an export artifact, never a replacement cover.
		if (url !== undefined && pending.maxEdge > 0) onShotRef.current(frame, url);
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
				(url) => noteShot(message.frame, message.id, url),
				() => noteShot(message.frame, message.id, undefined),
			);
		},
		[noteShot],
	);

	/**
	 * Ask the frame's shim for a self-capture, bounded to `maxEdge` device
	 * pixels on its longest side (0 for the frame at full resolution) and
	 * allowing it `settleMs` to finish arriving before it photographs itself.
	 * Resolves the data URL — or undefined for an unmounted, unbooted,
	 * already-capturing or mute frame. Bounded captures persist as thumbnails;
	 * a full-resolution export returns only to its caller.
	 */
	const requestCapture = useCallback(
		(frame: string, maxEdge = COVER_MAX_EDGE, settleMs = CAPTURE_SETTLE_BUDGET_MS): Promise<string | undefined> => {
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
		const camera = cameraRef.current;
		const viewport = viewportRef.current;
		const frames = framesRef.current;
		if (camera === null || viewport === null) return;
		const result = sweepLifecycle(model.current, {
			frames,
			camera,
			viewportWidth: viewport.clientWidth,
			viewportHeight: viewport.clientHeight,
			entered: enteredRef.current,
			frozen: frozenRef.current,
			inspected: inspectedRef.current,
			states: statesRef.current,
			ready: readyRef.current,
			capturing: new Set(captureWaiters.current.keys()),
			hasThumb: hasThumbRef.current,
			now: performance.now(),
		});
		for (const frame of result.exitCaptures) {
			void requestCapture(frame).then((url) => noteExitCapture(model.current, frame, url !== undefined));
		}
		for (const frame of result.refreshCaptures) void requestCapture(frame);
		if (result.changed) setStates(result.states);
	}, [cameraRef, viewportRef, framesRef, requestCapture]);

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
		model.current.staleStills.add(frame);
	}, []);

	return { states, ready, onIframe, noteLoaded, noteCaptureSource, markStale, capture: requestCapture };
}
