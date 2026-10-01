import { type DependencyList, useLayoutEffect, useRef } from "react";
import type { Camera } from "../api";
import { type Box, clamp } from "./camera";

/**
 * The camera, kept outside React (#81).
 *
 * A wheel tick used to be a `setCamera`, and so a render of the whole canvas:
 * every frame shell, every label, every overlay that takes the zoom, once per
 * event. On a page of 200 frames that was 4ms of main thread per pan tick and
 * 6 to 9ms per zoom tick against an 8.3ms frame, and writing the same transform
 * straight to the field cost a little over one. This is that straight write,
 * made the only way the camera moves.
 *
 * One value and one clock. `set` moves the value at once, so a hit test, a
 * flight or a decision made in the same event already reads where the camera
 * is. What is drawn follows at the next animation frame, once however many sets
 * arrived before it, and every listener is told in that one callback: the field,
 * the furniture over it and anything else that follows the camera all move in
 * the same frame, never one behind another.
 *
 * Nothing here knows the page. A listener is what writes a transform, a width
 * or a path, which is what keeps this the one thing anything that follows the
 * camera has to subscribe to.
 */
export interface CameraStore {
	/** Where the camera is now: what every hit test and every decision reads. */
	get(): Camera | null;
	/** Put the camera somewhere, ending any flight. Null is a field with nothing framed yet. */
	set(next: Camera | null): void;
	/**
	 * Fly to a camera on the bake-off's cubic ease-out (#9). The flight is drawn
	 * by the same frame that draws everything else, so it is never a frame
	 * behind its own furniture.
	 */
	fly(to: Camera, ms?: number): void;
	/** End a flight where it stands. */
	stop(): void;
	/** Hear every camera that is drawn, in the frame it is drawn in. Returns the unsubscribe. */
	subscribe(listener: (camera: Camera) => void): () => void;
}

/** The flight every move that takes you somewhere makes, unless it says otherwise. */
export const FLIGHT_MS = 220;

/**
 * What the camera can see, for the followers there is one of per frame (#81).
 *
 * A label or a corner off screen is drawn for nobody, and a zoom step that lays
 * out every one of them pays for all the ones nobody sees. So while the camera
 * moves, `near` holds a follower to what is on screen or a short way off it,
 * which a pan reaches before it reaches the screen; once the camera rests,
 * `near` says yes to everything, and a new `rest` is a follower's cue to catch
 * up on whatever it skipped.
 */
export interface FieldView {
	/** Whether a world box has to be drawn for this camera. */
	near(camera: Camera, box: Box): boolean;
	/** Where the camera last came to rest. */
	rest: Camera | null;
}

export function createCameraStore(): CameraStore {
	let camera: Camera | null = null;
	let drawn: Camera | null = null;
	let flight: { from: Camera; to: Camera; t0: number; ms: number } | null = null;
	// a flag rather than the handle: a test's requestAnimationFrame may run the
	// callback before it returns, and a handle compared to zero would then claim
	// a frame was still owed forever
	let scheduled = false;
	const listeners = new Set<(camera: Camera) => void>();

	const draw = (t: number) => {
		scheduled = false;
		if (flight !== null) {
			// the frame's own clock, against when the flight was asked for: a frame
			// that began before the ask lands on the start rather than ahead of it
			const p = clamp((t - flight.t0) / flight.ms, 0, 1);
			const e = 1 - (1 - p) ** 3;
			const { from, to } = flight;
			camera = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
			if (p < 1) schedule();
			else flight = null;
		}
		if (camera === null || camera === drawn) return;
		drawn = camera;
		for (const listener of listeners) listener(camera);
	};

	const schedule = () => {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(draw);
	};

	return {
		get: () => camera,
		set(next) {
			flight = null;
			camera = next;
			if (next === null) drawn = null;
			else schedule();
		},
		fly(to, ms = FLIGHT_MS) {
			if (camera === null) return;
			flight = { from: camera, to, t0: performance.now(), ms };
			schedule();
		},
		stop() {
			flight = null;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/**
 * Follow the camera from a component without ever rendering it.
 *
 * `apply` writes whatever the camera decides straight to the page: now, with
 * the camera as it stands, and then once per drawn frame. React keeps the
 * structure and never the values `apply` writes, so a render can never put
 * back a value the camera has already moved past. The deps are what `apply`
 * reads besides the camera; a change runs it again before the paint, so a
 * frame that moved under a still camera is drawn moved.
 */
export function useCameraFollow(store: CameraStore, apply: (camera: Camera) => void, deps: DependencyList): void {
	const latest = useRef(apply);
	latest.current = apply;
	useLayoutEffect(() => {
		const camera = store.get();
		if (camera !== null) latest.current(camera);
	}, [store, ...deps]);
	useLayoutEffect(() => store.subscribe((camera) => latest.current(camera)), [store]);
}
