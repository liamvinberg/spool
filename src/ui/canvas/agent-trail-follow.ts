import { type RefObject, useEffect, useRef, useState } from "react";
import type { Camera } from "../api";
import { LET_GO_MS } from "./agent-trail-model";
import { type Box, moveCamera } from "./camera";
import type { CameraStore } from "./camera-store";

/** Where the agent is writing, as following goes there: the frame, its page and its box once it has one. */
export interface TrailSpot {
	readonly name: string;
	readonly page: string;
	readonly box: Box | null;
}

/** Two cameras the same to the eye. */
const near = (a: Camera, b: Camera) =>
	Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.k / b.k - 1) < 1e-4;

/**
 * Following the agent (task 443): one press and the camera goes to each frame
 * as the agent writes it, the page with it when the frame is on another. A hand
 * on the camera or esc lets go, and so does following a teammate; when the turn
 * ends it lets go on its own a beat later, on the last thing it made.
 *
 * A hand is any camera this follow did not ask for: what it last asked for is
 * held, and a camera headed anywhere else ends it, as a teammate's follow does.
 */
export function useTrailFollow(options: {
	camera: CameraStore;
	viewportRef: RefObject<HTMLElement | null>;
	/** the frame being written, null when there is none to go to */
	spot: TrailSpot | null;
	/** the turn is running */
	running: boolean;
	/** the page the canvas shows */
	page: string;
	/** follow a teammate, which this lets go for */
	teammate: boolean;
	/** to another page, arriving where the camera stands and flying on to `then` */
	toPage: (page: string, arrive: Camera | undefined, then: Camera) => void;
}): { following: boolean; follow: (on: boolean) => void } {
	const { camera, viewportRef, spot, running, teammate } = options;
	const [following, setFollowing] = useState(false);
	const latest = useRef(options);
	latest.current = options;
	/** the camera this follow last asked for */
	const mine = useRef<Camera | null>(null);

	const follow = (on: boolean) => {
		mine.current = on ? camera.aim() : null;
		setFollowing(on);
	};

	// the camera goes to each frame as it is written: a new frame, or the box of one that has just landed
	const box = spot?.box ?? null;
	const where = box === null ? null : `${spot?.page}|${box.x}|${box.y}|${box.w}|${box.h}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the frame and where it stands are the trigger
	useEffect(() => {
		const at = latest.current.spot;
		const viewport = viewportRef.current;
		const cam = camera.aim();
		if (!following || at === null || at.box === null || viewport === null || cam === null) return;
		const goal = moveCamera(cam, at.box, viewport.clientWidth, viewport.clientHeight);
		mine.current = goal;
		if (at.page === latest.current.page) camera.fly(goal);
		// the page arrives where the camera stands and flies on in the same frame, so none of it reads as a hand
		else latest.current.toPage(at.page, camera.get() ?? undefined, goal);
	}, [following, spot?.name, where, camera, viewportRef]);

	// a hand on the camera lets go
	useEffect(() => {
		if (!following) return;
		return camera.subscribe((_, moving) => {
			// a camera coming to rest is one already heard moving
			if (!moving) return;
			const goal = mine.current;
			const aim = camera.aim();
			if (goal === null || aim === null || near(aim, goal)) return;
			setFollowing(false);
		});
	}, [following, camera]);

	// esc lets go, and is spent on it
	useEffect(() => {
		if (!following) return;
		const esc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setFollowing(false);
		};
		window.addEventListener("keydown", esc, true);
		return () => window.removeEventListener("keydown", esc, true);
	}, [following]);

	// following a teammate takes the camera
	useEffect(() => {
		if (teammate) setFollowing(false);
	}, [teammate]);

	// the turn's end lets go a beat later
	useEffect(() => {
		if (!following || running) return;
		const timer = setTimeout(() => setFollowing(false), LET_GO_MS);
		return () => clearTimeout(timer);
	}, [following, running]);

	return { following, follow };
}
