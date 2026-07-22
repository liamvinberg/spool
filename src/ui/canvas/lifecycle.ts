import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera, CanvasMode, ProjectedFrame } from "../api";
import { intersects, visibleWorldRect } from "./camera";
import { captureMessage } from "./protocol";

/**
 * The engine lifecycle (#8, #13): which frames run, which stand frozen, which
 * exist only as their thumbnail. Live mode: near frames play; tiny-rendered
 * and offscreen frames freeze (Chrome free-runs tiny live frames at 500+ Hz —
 * the zoom threshold is load-bearing), and after a grace window they take a
 * goodbye self-capture and unmount. Design mode: real DOM everywhere, time
 * stopped. Hibernation is automatic engine lifecycle, never a user mode;
 * double-click boots a hibernated frame fresh — reset-on-return is a feature.
 */

export type FrameState = "live" | "warm" | "hibernated";

const MARGIN_FRACTION = 0.5; // extra viewport fractions kept mounted around the screen
const K_MIN_LIVE = 0.15; // below this zoom nothing is interactable anyway
const GRACE_MS = 2000; // offscreen time a frame stays warm before hibernating
const EXIT_CAPTURE_TIMEOUT_MS = 600; // how long hibernation waits for the goodbye shot
const CAMERA_SETTLE_MS = 400; // capture on settle, never mid-gesture
const SWEEP_MS = 300;
const CAPTURE_REPLY_TIMEOUT_MS = 3000;

export interface LifecycleDeps {
	framesRef: RefObject<ProjectedFrame[]>;
	cameraRef: RefObject<Camera | null>;
	viewportRef: RefObject<HTMLDivElement | null>;
	mode: CanvasMode;
	entered: string | null;
	selected: string | null;
	hasThumb: (frame: string) => boolean;
	onShot: (frame: string, dataUrl: string) => void;
}

export function useFrameLifecycle(deps: LifecycleDeps) {
	const { framesRef, cameraRef, viewportRef, mode, entered, selected, hasThumb, onShot } = deps;

	const [states, setStates] = useState<Record<string, FrameState>>({});
	const [ready, setReady] = useState<ReadonlySet<string>>(new Set<string>());

	const statesRef = useRef(states);
	statesRef.current = states;
	const readyRef = useRef(ready);
	readyRef.current = ready;
	const modeRef = useRef(mode);
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const hasThumbRef = useRef(hasThumb);
	hasThumbRef.current = hasThumb;
	const onShotRef = useRef(onShot);
	onShotRef.current = onShot;

	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const lastUsable = useRef(new Map<string, number>());
	const exitPending = useRef(new Map<string, { t0: number; captured: boolean }>());
	const needsShot = useRef(new Set<string>());
	const captureWaiters = useRef(new Map<string, (ok: boolean) => void>());
	const prevCamera = useRef<Camera | null>(null);
	const lastCameraMove = useRef(0);

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
		captureWaiters.current.get(frame)?.(url !== undefined);
		captureWaiters.current.delete(frame);
		if (url !== undefined) onShotRef.current(frame, url);
	}, []);

	const requestCapture = useCallback((frame: string): Promise<boolean> => {
		const el = iframes.current.get(frame);
		if (el?.contentWindow == null || !readyRef.current.has(frame)) return Promise.resolve(false);
		const pending = captureWaiters.current.get(frame);
		if (pending !== undefined) return Promise.resolve(false);
		return new Promise((resolve) => {
			captureWaiters.current.set(frame, resolve);
			el.contentWindow?.postMessage(captureMessage, "*");
			setTimeout(() => {
				if (captureWaiters.current.get(frame) === resolve) {
					captureWaiters.current.delete(frame);
					resolve(false);
				}
			}, CAPTURE_REPLY_TIMEOUT_MS);
		});
	}, []);

	// The decision function: runs on a sweep interval and on mode flips.
	const compute = useCallback(() => {
		const camera = cameraRef.current;
		const viewport = viewportRef.current;
		const frames = framesRef.current;
		if (camera === null || viewport === null) return;
		const now = performance.now();

		const prev = prevCamera.current;
		if (prev === null || prev.x !== camera.x || prev.y !== camera.y || prev.k !== camera.k) {
			prevCamera.current = { ...camera };
			lastCameraMove.current = now;
		}
		const settled = now - lastCameraMove.current > CAMERA_SETTLE_MS;

		const visible = visibleWorldRect(camera, viewport.clientWidth, viewport.clientHeight, MARGIN_FRACTION);
		const next: Record<string, FrameState> = {};
		let changed = false;

		for (const frame of frames) {
			const current = statesRef.current[frame.name] ?? "hibernated";
			const onScreen = intersects(visible, frame);
			const usable = onScreen && camera.k >= K_MIN_LIVE;
			if (usable) {
				lastUsable.current.set(frame.name, now);
				exitPending.current.delete(frame.name);
			}

			let target: FrameState;
			if (modeRef.current === "design") {
				// design: time frozen everywhere (#8), no exceptions — the canvas
				// exits any entered frame on the way into design mode
				target = "warm";
				exitPending.current.delete(frame.name);
			} else if (enteredRef.current === frame.name) {
				target = "live";
			} else if (usable) {
				target = "live";
			} else if (current === "hibernated") {
				target = "hibernated";
			} else if (now - (lastUsable.current.get(frame.name) ?? 0) < GRACE_MS) {
				target = "warm";
			} else {
				// past grace: try one goodbye capture while the DOM still exists
				const exit = exitPending.current.get(frame.name);
				if (exit === undefined) {
					exitPending.current.set(frame.name, { t0: now, captured: false });
					void requestCapture(frame.name).then((ok) => {
						const entry = exitPending.current.get(frame.name);
						if (entry !== undefined) entry.captured = ok;
					});
					target = "warm";
				} else if (exit.captured || now - exit.t0 >= EXIT_CAPTURE_TIMEOUT_MS) {
					exitPending.current.delete(frame.name);
					target = "hibernated";
				} else {
					target = "warm";
				}
			}

			// first click pre-boots (#8): a selected frame mounts hidden so the
			// double-click that follows reveals an already-running frame
			if (target === "hibernated" && selectedRef.current === frame.name) target = "warm";

			// leaving live stales the thumbnail; refresh once the camera settles,
			// while the (hidden) DOM is still mounted
			if (current === "live" && target === "warm") needsShot.current.add(frame.name);
			if (
				target !== "hibernated" &&
				settled &&
				(needsShot.current.has(frame.name) || !hasThumbRef.current(frame.name)) &&
				!captureWaiters.current.has(frame.name) &&
				!exitPending.current.has(frame.name) &&
				readyRef.current.has(frame.name)
			) {
				needsShot.current.delete(frame.name);
				void requestCapture(frame.name);
			}

			next[frame.name] = target;
			if (target !== current) changed = true;
		}

		if (changed || Object.keys(statesRef.current).length !== frames.length) setStates(next);
	}, [cameraRef, viewportRef, framesRef, requestCapture]);

	// mode flips recompute immediately — D must feel instant, not one sweep late
	useEffect(() => {
		modeRef.current = mode;
		compute();
	}, [mode, compute]);

	useEffect(() => {
		const sweep = setInterval(compute, SWEEP_MS);
		return () => clearInterval(sweep);
	}, [compute]);

	/** A source edit made this frame's cover stale (#22: SSE-live updates). */
	const markStale = useCallback((frame: string) => {
		needsShot.current.add(frame);
	}, []);

	return { states, ready, onIframe, noteLoaded, noteShot, markStale };
}
