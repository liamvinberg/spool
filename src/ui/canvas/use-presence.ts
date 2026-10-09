import { type RefObject, useEffect, useRef } from "react";
import { PRESENCE_DRAGGING, type PresenceState } from "../../team-sync-protocol";
import { toWorld } from "./camera";
import type { CameraStore } from "./camera-store";
import { followCamera, type PresenceRoom } from "./presence";

/** At most one presence in this many milliseconds is sent; the receiving canvas smooths between them. */
export const PRESENCE_SEND_MS = 50;
/** How quickly a follower's camera eases onto the view it follows, per second. */
const FOLLOW_RATE = 8;

/** What the frame this person is inside live tells the canvas about them: none of it crosses the iframe. */
export interface InsideFrame {
	/** The pointer in world coordinates, or null while the frame hasn't seen it yet, and whether it's pressed. */
	pointer(at: { x: number; y: number } | null, pressed: boolean): void;
	/** Everything in it scrolled so far, added up. */
	scrolled(scrolled: { x: number; y: number }): void;
}

/**
 * Say where this canvas's person is on a team canvas, as it changes (DEV-196): the page, the pointer in world
 * coordinates, a press, the frames a drag is moving, the frame they're inside live and the rectangle the
 * camera shows. Inside a live frame the frame tells the pointer, each press as a click, and its scrolling, through
 * the returned `InsideFrame`. Sent no more often than `PRESENCE_SEND_MS`, and only when something changed: to
 * the daemon from the Mac's canvas, to spool.page from the read-only one.
 */
export function usePresenceSender(options: {
	/** Where a change goes; one function for as long as the canvas is open. */
	send: (state: PresenceState) => void;
	team: boolean;
	camera: CameraStore;
	viewportRef: RefObject<HTMLDivElement | null>;
	page: string;
	inside: string | null;
	/** The frames a gesture is moving now, read when a state goes. */
	dragging: () => readonly string[];
}): InsideFrame {
	const latest = useRef(options);
	latest.current = options;
	const soon = useRef<() => void>(() => {});
	const insideFrame = useRef<InsideFrame>({ pointer: () => {}, scrolled: () => {} });
	const leftFrame = useRef<() => void>(() => {});
	const { send: say, team, camera, viewportRef } = options;

	useEffect(() => {
		if (!team) return;
		let pointer: { x: number; y: number } | null = null;
		let pressed = false;
		// told by the frame they're inside: its pointer already in world coordinates, the presses and the scrolling
		let framePointer: { x: number; y: number } | null = null;
		let clicks = 0;
		let scrolled: { x: number; y: number } | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let sentAt = Number.NEGATIVE_INFINITY;
		let told = "";
		const state = (): PresenceState => {
			const cam = camera.get();
			const viewport = viewportRef.current;
			const { page, inside, dragging } = latest.current;
			const world = framePointer ?? (pointer === null || cam === null ? null : toWorld(pointer, cam));
			return {
				clicks,
				scrolled: inside === null ? null : scrolled,
				page,
				pointer: world === null ? null : { x: round(world.x), y: round(world.y) },
				pressed,
				dragging: dragging().slice(0, PRESENCE_DRAGGING),
				inside,
				view:
					cam === null || viewport === null
						? null
						: {
								x: round(-cam.x / cam.k),
								y: round(-cam.y / cam.k),
								w: round(viewport.clientWidth / cam.k),
								h: round(viewport.clientHeight / cam.k),
							},
			};
		};
		const send = () => {
			timer = undefined;
			const next = state();
			const json = JSON.stringify(next);
			if (json === told) return;
			told = json;
			sentAt = performance.now();
			say(next);
		};
		// never in the event itself: a gesture the canvas starts or ends on this event is read once it has
		const later = () => {
			timer ??= setTimeout(send, Math.max(0, sentAt + PRESENCE_SEND_MS - performance.now()));
		};
		soon.current = later;
		/** Where the pointer is on the canvas, or false when it's over the window's other furniture. */
		const over = (event: PointerEvent): boolean => {
			const viewport = viewportRef.current;
			if (viewport === null || !(event.target instanceof Node) || !viewport.contains(event.target)) return false;
			const rect = viewport.getBoundingClientRect();
			pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
			return true;
		};
		const move = (event: PointerEvent) => {
			framePointer = null;
			if (!over(event) && !pressed) pointer = null;
			later();
		};
		const press = (event: PointerEvent) => {
			if (!over(event)) return;
			framePointer = null;
			pressed = true;
			later();
		};
		insideFrame.current = {
			pointer(at, press) {
				if (at !== null) framePointer = at;
				// a press and its release can both land between two sends, so each press is counted, not just held
				if (press && !pressed) clicks++;
				pressed = press;
				later();
			},
			scrolled(next) {
				scrolled = next;
				later();
			},
		};
		leftFrame.current = () => {
			framePointer = null;
			scrolled = null;
		};
		const release = () => {
			if (!pressed) return;
			pressed = false;
			later();
		};
		const out = (event: PointerEvent) => {
			// out of the window, or into a frame's own document: one gone inside a live frame stays where it went in
			if (event.relatedTarget !== null || pressed || latest.current.inside !== null) return;
			pointer = null;
			later();
		};
		// heard in the capture phase, so nothing the canvas stops on its way reaches it any less
		document.addEventListener("pointermove", move, true);
		document.addEventListener("pointerdown", press, true);
		document.addEventListener("pointerout", out, true);
		window.addEventListener("pointerup", release, true);
		window.addEventListener("pointercancel", release, true);
		const unwatch = camera.subscribe(later);
		later();
		return () => {
			soon.current = () => {};
			insideFrame.current = { pointer: () => {}, scrolled: () => {} };
			leftFrame.current = () => {};
			if (timer !== undefined) clearTimeout(timer);
			document.removeEventListener("pointermove", move, true);
			document.removeEventListener("pointerdown", press, true);
			document.removeEventListener("pointerout", out, true);
			window.removeEventListener("pointerup", release, true);
			window.removeEventListener("pointercancel", release, true);
			unwatch();
		};
	}, [say, team, camera, viewportRef]);

	// a page switch or a frame gone inside is news even with the pointer still
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page and the frame inside are the triggers; the send reads them through the ref
	useEffect(() => soon.current(), [options.page, options.inside]);
	// a frame left takes its scrolling with it; the next one entered tells its own
	// biome-ignore lint/correctness/useExhaustiveDependencies: the frame inside is the trigger
	useEffect(() => leftFrame.current(), [options.inside]);

	return useRef<InsideFrame>({
		pointer: (at, press) => insideFrame.current.pointer(at, press),
		scrolled: (scrolled) => insideFrame.current.scrolled(scrolled),
	}).current;
}

/**
 * Follow a teammate's view (DEV-196): this camera eases onto the rectangle theirs shows, onto their page when
 * they change it, until esc, until anything else moves the camera, or until they leave.
 */
export function useFollow(options: {
	room: PresenceRoom;
	following: string | null;
	stop: () => void;
	camera: CameraStore;
	viewportRef: RefObject<HTMLDivElement | null>;
	page: string;
	/** Go to a page for the follow, or say it isn't one here. */
	goToPage: (page: string) => boolean;
}): void {
	const latest = useRef(options);
	latest.current = options;
	const { following, camera, room, viewportRef } = options;

	useEffect(() => {
		if (following === null) return;
		const stop = () => latest.current.stop();
		// the camera this follow last put, so anything else moving it ends the follow; null adopts whatever is there
		let mine: object | null = null;
		let asked: string | null = null;
		let last = performance.now();
		let frame = requestAnimationFrame(function step(time) {
			const dt = Math.min(0.1, (time - last) / 1000);
			last = time;
			const mate = room.get(following);
			const cam = camera.get();
			const viewport = viewportRef.current;
			if (mate === undefined || mate.left !== null) return stop();
			if (mine !== null && cam !== mine) return stop();
			if (mate.state.page !== latest.current.page) {
				// their page first; the camera there is adopted once it has arrived
				if (asked !== mate.state.page && !latest.current.goToPage(mate.state.page)) return stop();
				asked = mate.state.page;
				mine = null;
			} else if (cam !== null && viewport !== null && mate.state.view !== null) {
				const width = viewport.clientWidth;
				const height = viewport.clientHeight;
				const goal = followCamera(mate.state.view, { width, height });
				const u = 1 - Math.exp(-FOLLOW_RATE * dt);
				// eased as a centre and a zoom, so a zoom doesn't swing the view sideways on the way
				const k = cam.k * (goal.k / cam.k) ** u;
				const centre = (c: { x: number; y: number; k: number }) => ({
					x: (width / 2 - c.x) / c.k,
					y: (height / 2 - c.y) / c.k,
				});
				const from = centre(cam);
				const to = centre(goal);
				const cx = from.x + (to.x - from.x) * u;
				const cy = from.y + (to.y - from.y) * u;
				const next = { k, x: width / 2 - cx * k, y: height / 2 - cy * k };
				// arrived is left alone, so a still view lets the camera come to rest
				if (Math.abs(next.x - cam.x) + Math.abs(next.y - cam.y) > 0.05 || Math.abs(next.k / cam.k - 1) > 1e-4) {
					camera.set(next);
					mine = next;
				} else mine = cam;
				asked = null;
			} else mine = cam;
			frame = requestAnimationFrame(step);
		});
		const stopOnEsc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			stop();
		};
		window.addEventListener("keydown", stopOnEsc, true);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("keydown", stopOnEsc, true);
		};
	}, [following, camera, room, viewportRef]);
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}
