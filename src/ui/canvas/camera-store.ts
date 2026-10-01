import { type DependencyList, useLayoutEffect, useRef } from "react";
import type { Camera } from "../api";
import { clamp } from "./camera";

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
 * the same frame, never one behind another. A drawn camera left alone for a
 * moment is at rest, and the store says so too, so what is decided at rest is
 * decided once and by everyone in the same callback, whatever order they
 * subscribed in.
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
	/** Where the camera last came to rest: drawn, then left alone for `REST_MS`. */
	rest(): Camera | null;
	/**
	 * Hear the camera. Every camera drawn, in the frame it is drawn in, with
	 * `moving` set; the same camera once more when it comes to rest, with
	 * `moving` clear; and null in the frame after the camera goes. Returns the
	 * unsubscribe.
	 */
	subscribe(listener: (camera: Camera | null, moving: boolean) => void): () => void;
}

/** The flight every move that takes you somewhere makes, unless it says otherwise. */
export const FLIGHT_MS = 220;

/**
 * How long a drawn camera has to be left alone to be at rest.
 *
 * The whole of "the camera is moving" (#171): live frames hold their animations
 * across it, the lifecycle mounts only where the camera came to rest rather
 * than throughout a gesture, and whatever skipped work while the camera moved
 * catches up when it ends.
 */
export const REST_MS = 100;

export function createCameraStore(): CameraStore {
	let camera: Camera | null = null;
	let drawn: Camera | null = null;
	let rested: Camera | null = null;
	let flight: { from: Camera; to: Camera; t0: number; ms: number } | null = null;
	// a flag rather than the handle: a test's requestAnimationFrame may run the
	// callback before it returns, and a handle compared to zero would then claim
	// a frame was still owed forever
	let scheduled = false;
	let settle: ReturnType<typeof setTimeout> | undefined;
	const listeners = new Set<(camera: Camera | null, moving: boolean) => void>();

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
		if (camera === drawn) return;
		drawn = camera;
		clearTimeout(settle);
		if (camera === null) {
			rested = null;
			for (const listener of listeners) listener(null, false);
			return;
		}
		for (const listener of listeners) listener(camera, true);
		settle = setTimeout(() => {
			// a camera set since the last frame is a gesture still going: its own
			// frame is owed, and it starts the quiet window over
			if (drawn === null || camera !== drawn) return;
			rested = drawn;
			for (const listener of listeners) listener(drawn, false);
		}, REST_MS);
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
			schedule();
		},
		fly(to, ms = FLIGHT_MS) {
			if (camera === null) return;
			flight = { from: camera, to, t0: performance.now(), ms };
			schedule();
		},
		stop() {
			flight = null;
		},
		rest: () => rested,
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
 * the camera as it stands, then once per drawn frame, and once more when the
 * camera comes to rest. `moving` says which, so a follower that skips work in
 * motion knows when to catch up. React keeps the structure and never the
 * values `apply` writes, so a render can never put back a value the camera has
 * already moved past. The deps are what `apply` reads besides the camera; a
 * change runs it again before the paint, so a frame that moved under a still
 * camera is drawn moved.
 */
export function useCameraFollow(
	store: CameraStore,
	apply: (camera: Camera, moving: boolean) => void,
	deps: DependencyList,
): void {
	const latest = useRef(apply);
	// the committed apply, never one from a render React threw away
	useLayoutEffect(() => {
		latest.current = apply;
	});
	useLayoutEffect(() => {
		const camera = store.get();
		if (camera !== null) latest.current(camera, camera !== store.rest());
	}, [store, ...deps]);
	useLayoutEffect(
		() =>
			store.subscribe((camera, moving) => {
				if (camera !== null) latest.current(camera, moving);
			}),
		[store],
	);
}
