import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COVER_MAX_EDGE } from "../../cover";
import type { Camera, ProjectedFrame } from "../api";
import { intersects, toWorld, visibleWorldRect } from "./camera";
import { captureMessage } from "./protocol";

/**
 * The engine lifecycle (#8, #13, #40, #54): which frames run, which stand
 * frozen, which exist only as their still. Near frames play; tiny-rendered,
 * offscreen, and selected-into frames freeze (Chrome free-runs tiny frames at
 * 500+ Hz — the zoom threshold is load-bearing) and stay mounted in the warm
 * pool.
 * Hibernation's payoff is memory, never CPU: only pool overflow demotes a
 * frame to its still, oldest-seen first, html frames taking a goodbye
 * self-capture on the way out. Every mount drains through the wake queue —
 * entered immediately, the freeze target and the inspected frame next, then
 * nearest the viewport center, a few per sweep — so no burst site can land every mount in one
 * commit. Hibernation is automatic engine lifecycle, never a tool; entering a
 * hibernated frame boots it fresh, while freezing always keeps its document.
 */

export type FrameState = "live" | "warm" | "hibernated";

const MARGIN_FRACTION = 0.5; // extra viewport fractions kept mounted around the screen
const K_MIN_LIVE = 0.15; // below this zoom nothing is interactable anyway
const EXIT_CAPTURE_TIMEOUT_MS = 600; // how long an eviction waits for the goodbye shot
const CAMERA_SETTLE_MS = 400; // capture on settle, never mid-gesture
const SWEEP_MS = 300;
const CAPTURE_REPLY_TIMEOUT_MS = 3000;
export const MOUNTS_PER_SWEEP = 3; // wake-queue drain rate: 3 × ~8 ms ≈ one skipped paint per sweep at worst
export const WARM_POOL_CAP = 24; // offscreen warm frames kept mounted; each holds ~4.6 MB and a renderer

/** The decision function's persistent bookkeeping, owned by the hook, fabricated by tests. */
export interface LifecycleModel {
	/** When each frame was last usable — the warm pool evicts oldest-seen first. */
	lastUsable: Map<string, number>;
	/** Evictions mid-goodbye: the frame stays warm until its capture lands or times out. */
	exitPending: Map<string, { t0: number; captured: boolean }>;
	/** Frames whose still went stale — a source edit, or leaving live. */
	staleStills: Set<string>;
	prevCamera: Camera | null;
	lastCameraMove: number;
}

export function createLifecycleModel(): LifecycleModel {
	return {
		lastUsable: new Map(),
		exitPending: new Map(),
		staleStills: new Set(),
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
	/** Frames whose boot has reported loaded — the ones a capture can reach. */
	ready: ReadonlySet<string>;
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
	if (prev === null || prev.x !== camera.x || prev.y !== camera.y || prev.k !== camera.k) {
		model.prevCamera = { ...camera };
		model.lastCameraMove = now;
	}
	const settled = now - model.lastCameraMove > CAMERA_SETTLE_MS;

	const margined = visibleWorldRect(camera, viewportWidth, viewportHeight, MARGIN_FRACTION);
	const strict = visibleWorldRect(camera, viewportWidth, viewportHeight, 0);
	const center = toWorld({ x: viewportWidth / 2, y: viewportHeight / 2 }, camera);

	interface Entry {
		frame: ProjectedFrame;
		current: FrameState;
		usable: boolean;
		target: FrameState;
	}
	const entries: Entry[] = [];
	// the wake queue: every mount waits here; strictly-visible frames precede
	// the margin ring, nearest the viewport center first within each tier
	const waiting: { entry: Entry; wakeTo: "live" | "warm"; tier: number; dist: number }[] = [];

	for (const frame of frames) {
		const current = states[frame.name] ?? "hibernated";
		const onScreen = intersects(margined, frame);
		const usable = onScreen && camera.k >= K_MIN_LIVE;
		if (usable) {
			model.lastUsable.set(frame.name, now);
		}
		// Coming back into view or becoming the one frozen intent rescues an
		// eviction mid-goodbye. A freeze must keep the existing document.
		if (usable || frozen === frame.name || inspected === frame.name) model.exitPending.delete(frame.name);

		let target: FrameState;
		let wakeTo: "live" | "warm" | null = null;
		if (current !== "hibernated") {
			target = frozen === frame.name ? "warm" : entered === frame.name || usable ? "live" : "warm";
		} else if (entered === frame.name && frozen !== frame.name) {
			// entering mounts in its own sweep, bypassing the cap
			target = "live";
		} else {
			target = "hibernated";
			// an open rail is watched intent (#58): its frame mounts even offscreen,
			// or it has no DOM to answer the elements tab with
			wakeTo = frozen === frame.name ? "warm" : usable ? "live" : inspected === frame.name ? "warm" : null;
		}

		const entry: Entry = { frame, current, usable, target };
		entries.push(entry);
		if (wakeTo !== null) {
			const cx = frame.x + frame.w / 2 - center.x;
			const cy = frame.y + frame.h / 2 - center.y;
			const tier =
				frozen === frame.name || inspected === frame.name ? 0 : intersects(strict, frame) ? 1 : onScreen ? 2 : 3;
			waiting.push({ entry, wakeTo, tier, dist: cx * cx + cy * cy });
		}
	}

	waiting.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
	for (const admitted of waiting.slice(0, MOUNTS_PER_SWEEP)) admitted.entry.target = admitted.wakeTo;

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
			!e.usable &&
			e.frame.name !== frozen &&
			e.frame.name !== inspected &&
			!model.exitPending.has(e.frame.name),
	);
	const overflow = pool.length - WARM_POOL_CAP;
	if (overflow > 0) {
		pool.sort((a, b) => (model.lastUsable.get(a.frame.name) ?? 0) - (model.lastUsable.get(b.frame.name) ?? 0));
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

	const refreshCaptures: string[] = [];
	const next: Record<string, FrameState> = {};
	let changed = false;
	for (const { frame, current, target } of entries) {
		// leaving live stales the still; refresh once the camera settles,
		// while the (hidden) DOM is still mounted
		if (current === "live" && target === "warm" && frame.kind !== "term") model.staleStills.add(frame.name);
		if (
			frame.kind !== "term" &&
			target !== "hibernated" &&
			settled &&
			(model.staleStills.has(frame.name) || !hasThumb(frame.name)) &&
			!capturing.has(frame.name) &&
			!model.exitPending.has(frame.name) &&
			ready.has(frame.name)
		) {
			model.staleStills.delete(frame.name);
			refreshCaptures.push(frame.name);
		}
		next[frame.name] = target;
		if (target !== current) changed = true;
	}
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
	const [ready, setReady] = useState<ReadonlySet<string>>(new Set<string>());

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
	const captureWaiters = useRef(new Map<string, (url: string | undefined) => void>());

	const onIframe = useCallback((frame: string, el: HTMLIFrameElement | null) => {
		if (el !== null) {
			iframes.current.set(frame, el);
			return;
		}
		iframes.current.delete(frame);
		// unmount (or reload) drops the boot: the cover returns until the next loaded report
		setReady((current) => {
			if (!current.has(frame)) return current;
			const next = new Set(current);
			next.delete(frame);
			return next;
		});
	}, []);

	/** The frame's loaded report (commit-time effect, #17) — routed in by the canvas's message listener. */
	const noteLoaded = useCallback((frame: string) => {
		setReady((current) => (current.has(frame) ? current : new Set(current).add(frame)));
	}, []);

	/** A shot reply from the frame's shim: resolve the waiter, persist upward. */
	const noteShot = useCallback((frame: string, url: string | undefined) => {
		captureWaiters.current.get(frame)?.(url);
		captureWaiters.current.delete(frame);
		if (url !== undefined) onShotRef.current(frame, url);
	}, []);

	/**
	 * Ask the frame's shim for a self-capture, bounded to `maxEdge` device
	 * pixels on its longest side (0 for the frame at full resolution).
	 * Resolves the data URL — or undefined for an unmounted, unbooted,
	 * already-capturing or mute frame — and every landed capture also persists
	 * as the thumbnail via onShot.
	 */
	const requestCapture = useCallback((frame: string, maxEdge = COVER_MAX_EDGE): Promise<string | undefined> => {
		const el = iframes.current.get(frame);
		if (el?.contentWindow == null || !readyRef.current.has(frame)) return Promise.resolve(undefined);
		const pending = captureWaiters.current.get(frame);
		if (pending !== undefined) return Promise.resolve(undefined);
		return new Promise((resolve) => {
			captureWaiters.current.set(frame, resolve);
			el.contentWindow?.postMessage(captureMessage(maxEdge), "*");
			setTimeout(() => {
				if (captureWaiters.current.get(frame) === resolve) {
					captureWaiters.current.delete(frame);
					resolve(undefined);
				}
			}, CAPTURE_REPLY_TIMEOUT_MS);
		});
	}, []);

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

	return { states, ready, onIframe, noteLoaded, noteShot, markStale, capture: requestCapture };
}
