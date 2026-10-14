import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Camera } from "../api";
import { formatCombo } from "../hotkey-combos";
import { revealCamera } from "./camera";
import type { CameraStore } from "./camera-store";
import { type CanvasStore, useCanvasState, visibleFramesOf } from "./canvas-store";
import type { LiveChip } from "./frame-label";
import {
	createAltHold,
	forkNote,
	landOverview,
	moveOverview,
	OVERVIEW_OPEN_MS,
	type Overview,
	openOverview,
	overviewCamera,
	overviewPan,
	pointOverview,
	sideOf,
	stepDirection,
	type ThreadFork,
	type ThreadStep,
	threadBack,
	threadNext,
} from "./live-moves";
import { type SpatialDirection, type SpatialTrail, stepSpatially } from "./spatial-navigation";

/** How long a note on the live chip stands before the chip says live again. */
const NOTE_MS = 1800;

export interface LiveMoveDeps {
	camera: CameraStore;
	viewportRef: RefObject<HTMLDivElement | null>;
	/** what the canvas holds: the frame live, the selection, the threads and the frames */
	store: CanvasStore;
	/** go inside a frame, the way a double-click does, the camera flown on moveCamera from `from` */
	enterFrame: (name: string, from: Camera | null) => void;
	/** walk to a frame the way its data-go would: fresh boot, its page if it is on another; the camera on moveCamera */
	walkTo: (name: string) => void;
	/** select one frame out on the canvas, as a click does */
	select: (name: string, trail: SpatialTrail | null) => void;
	/** hand the keyboard back to an entered frame */
	focusFrame: (name: string) => void;
	/** select a frame anywhere, its page brought first if it is on another, as the finder does */
	landOn: (name: string) => void;
	/** whether a frame selected out on the canvas may take the overview now: no gesture, no edit */
	selectionIdle: () => boolean;
}

/**
 * Moving between frames while one is live (DEV-295), as the canvas holds it:
 * the ⌥ overview, steps that land entered, the walk along the threads with
 * its forks, and the live chip that says how you arrived. The register
 * entries (canvas.step, canvas.step-through, canvas.overview,
 * canvas.thread-next, canvas.thread-back) run the handlers here, from the
 * canvas's own keys and from the ones an entered frame relays.
 */
export function useLiveMoves(deps: LiveMoveDeps) {
	const depsRef = useRef(deps);
	depsRef.current = deps;
	const [overview, setOverviewState] = useState<Overview | null>(null);
	const overviewRef = useRef<Overview | null>(null);
	const setOverview = useCallback((next: Overview | null) => {
		overviewRef.current = next;
		setOverviewState(next);
	}, []);
	// the chip of the frame entered, and whether its arrival flashes the ring
	const [chip, setChip] = useState<(LiveChip & { frame: string; ring: boolean }) | null>(null);
	// the way back along ⌥ steps taken while live, by where the last one landed
	const liveTrail = useRef<SpatialTrail | null>(null);
	// every move taken while live, newest last: what ⌘[ walks back along
	const taken = useRef<ThreadStep[]>([]);
	const fork = useRef<ThreadFork | null>(null);
	// the frame a live move just left: it may still hold the keyboard while the
	// one it landed on boots, so what it relays still counts
	// hold the keyboard while the one it landed on boots, so what it relays
	// still counts until the landed one is heard from (loaded, or a relay)
	const leftLive = useRef<{ from: string; to: string } | null>(null);
	const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const frameNamed = useCallback(
		(name: string) => visibleFramesOf(depsRef.current.store.get()).find((frame) => frame.name === name),
		[],
	);
	const viewSize = useCallback(() => {
		const viewport = depsRef.current.viewportRef.current;
		return viewport === null ? null : { w: viewport.clientWidth, h: viewport.clientHeight };
	}, []);

	const say = useCallback((frame: string, note: string | null, stays = false) => {
		if (noteTimer.current !== null) clearTimeout(noteTimer.current);
		noteTimer.current = null;
		setChip((current) =>
			current !== null && current.frame === frame
				? { ...current, note }
				: { frame, at: performance.now(), came: null, note, ring: false },
		);
		if (note !== null && !stays) {
			noteTimer.current = setTimeout(() => {
				noteTimer.current = null;
				setChip((current) => (current?.note === note ? { ...current, note: null } : current));
			}, NOTE_MS);
		}
	}, []);
	useEffect(
		() => () => {
			if (noteTimer.current !== null) clearTimeout(noteTimer.current);
		},
		[],
	);

	/** Arrive somewhere live: the chip slides in from where you came, the ring flashes once. */
	const landed = useCallback((from: string | null, to: string, came: SpatialDirection | null, note: string | null) => {
		leftLive.current = from !== null && from !== to ? { from, to } : null;
		if (noteTimer.current !== null) clearTimeout(noteTimer.current);
		noteTimer.current = null;
		setChip({ frame: to, at: performance.now(), came, note, ring: true });
	}, []);

	/** Into a frame from the one entered now, by a step, the overview or a click: the target brought to you. */
	const landLive = useCallback(
		(target: string, came: SpatialDirection | null, from: { camera?: Camera; leaving?: string } = {}) => {
			const { enterFrame, camera, store } = depsRef.current;
			// a click has already put the frame it left down by the time it lands
			const at = from.leaving ?? store.get().entered;
			const frame = frameNamed(target);
			if (frame === undefined) return;
			if (at !== null && at !== target) taken.current = [...taken.current, { from: at, to: target }];
			fork.current = null;
			const was = at === null ? undefined : frameNamed(at);
			// one flight, from the camera the move started at: the overview's saved one, else where it stands
			enterFrame(target, from.camera ?? camera.get());
			landed(at, target, came ?? (was === undefined ? null : sideOf(was, frame)), null);
		},
		[frameNamed, landed],
	);

	/**
	 * The overview's camera: on opening, out to its zoom; on a move of its
	 * target, panned at the zoom it is headed for (its own, or one the wheel
	 * chose), only as far as brings the target into view.
	 */
	const flyOverview = useCallback(
		(next: Overview, opening: boolean) => {
			const target = frameNamed(next.target);
			const size = viewSize();
			const { camera, store } = depsRef.current;
			const from = camera.aim();
			if (target === undefined || size === null || from === null) return;
			const to = opening
				? overviewCamera(target, visibleFramesOf(store.get()), next.saved, size.w, size.h)
				: overviewPan(from, target, size.w, size.h);
			camera.fly(to, OVERVIEW_OPEN_MS);
		},
		[frameNamed, viewSize],
	);

	/** Where the overview opens from right now: the entered frame, else the one frame selected. */
	const overviewOrigin = useCallback((): { mode: Overview["mode"]; origin: string } | null => {
		const { store, selectionIdle } = depsRef.current;
		const entered = store.get().entered;
		if (entered !== null) return frameNamed(entered) === undefined ? null : { mode: "live", origin: entered };
		const selected = store.get().selected;
		const [only] = selected;
		if (selected.length !== 1 || only === undefined || !selectionIdle() || frameNamed(only) === undefined)
			return null;
		return { mode: "select", origin: only };
	}, [frameNamed]);

	const open = useCallback((): Overview | null => {
		const from = overviewOrigin();
		const saved = depsRef.current.camera.get();
		if (from === null || saved === null) return null;
		const next = openOverview(from.mode, from.origin, saved);
		setOverview(next);
		flyOverview(next, true);
		return next;
	}, [overviewOrigin, setOverview, flyOverview]);

	const openRef = useRef(open);
	openRef.current = open;
	const [hold] = useState(() => createAltHold(() => openRef.current()));

	const cancel = useCallback(() => {
		hold.cancel();
		const current = overviewRef.current;
		if (current === null) return;
		setOverview(null);
		depsRef.current.camera.fly(current.saved, OVERVIEW_OPEN_MS);
		if (current.mode === "live") depsRef.current.focusFrame(current.origin);
	}, [hold, setOverview]);

	/** Where the overview lands: fly in and enter the target, back in where it opened, or select it. */
	const land = useCallback(
		(current: Overview) => {
			setOverview(null);
			const landing = landOverview(current);
			const { camera, select, focusFrame } = depsRef.current;
			const target = frameNamed(landing.target);
			const size = viewSize();
			if (landing.kind === "stay" || target === undefined || size === null) {
				camera.fly(current.saved);
				if (current.mode === "live") focusFrame(current.origin);
				return;
			}
			if (landing.kind === "enter") {
				landLive(landing.target, landing.came, { camera: current.saved });
				liveTrail.current = current.trail;
				return;
			}
			select(landing.target, current.trail);
			camera.fly(revealCamera(current.saved, target, size.w, size.h));
		},
		[setOverview, frameNamed, viewSize, landLive],
	);

	/** Letting go of ⌥: the overview lands on its target. */
	const release = useCallback(() => {
		hold.up();
		const current = overviewRef.current;
		if (current !== null) land(current);
	}, [hold, land]);

	/**
	 * The pointer over a frame while the overview is up makes it the target,
	 * where the camera stands: the pointer is already on it, so nothing flies.
	 */
	const point = useCallback(
		(name: string) => {
			const current = overviewRef.current;
			if (current === null || frameNamed(name) === undefined) return;
			const next = pointOverview(current, name);
			if (next !== current) setOverview(next);
		},
		[frameNamed, setOverview],
	);

	/**
	 * A click while the overview is up: on a frame it lands there at once, as
	 * letting go would; on the empty canvas it closes, flying back. ⌥ is still
	 * down, so the hold ends here and its keyup finds nothing open.
	 */
	const pick = useCallback(
		(name: string | null) => {
			const current = overviewRef.current;
			if (current === null) return;
			if (name === null || frameNamed(name) === undefined) {
				cancel();
				return;
			}
			hold.cancel();
			land(pointOverview(current, name));
		},
		[hold, cancel, frameNamed, land],
	);

	/**
	 * ⌥ arrows and ⌥ hjkl. With the overview up they move its target; inside a
	 * frame the first opens it at once; ⌘⌥ steps straight through and lands
	 * entered. Out on the canvas with nothing up, the selection's own step is
	 * the canvas's, so this answers false.
	 */
	const step = useCallback(
		(event: KeyboardEvent, through: boolean): boolean => {
			const direction = stepDirection(event);
			if (direction === undefined) return false;
			const frames = visibleFramesOf(depsRef.current.store.get());
			const current = overviewRef.current;
			if (current !== null && !through) {
				event.preventDefault();
				const next = moveOverview(current, frames, direction);
				setOverview(next);
				if (next.target !== current.target) flyOverview(next, false);
				return true;
			}
			// the arrow is another key: a ⌥ held this long no longer opens anything
			if (current !== null) cancel();
			hold.cancel();
			const entered = depsRef.current.store.get().entered;
			if (entered === null) return false;
			event.preventDefault();
			if (through) {
				const from = frameNamed(entered);
				const trail = liveTrail.current?.at === entered ? liveTrail.current : null;
				const moved = from === undefined ? undefined : stepSpatially(from, frames, direction, trail);
				if (moved === undefined) return true;
				landLive(moved.target.name, direction);
				liveTrail.current = moved.trail;
				return true;
			}
			const opened = open();
			if (opened !== null) {
				const next = moveOverview(opened, frames, direction);
				setOverview(next);
				flyOverview(next, false);
			}
			return true;
		},
		[hold, cancel, open, setOverview, flyOverview, frameNamed, landLive],
	);

	/** ⌘]: on along the thread, entered, or the selection along it out on the canvas. */
	const walkOn = useCallback(
		(event?: KeyboardEvent) => {
			const { store, walkTo, select, camera } = depsRef.current;
			const entered = store.get().entered;
			const selected = store.get().selected;
			const at = entered ?? (selected.length === 1 ? (selected[0] ?? null) : null);
			if (at === null) return;
			event?.preventDefault();
			const move = threadNext(at, store.get().edges, fork.current);
			if (move.kind === "none") {
				if (entered !== null) say(entered, move.note);
				return;
			}
			fork.current = move.fork;
			if (entered === null) {
				// a thread that runs onto another page goes there, as the finder does
				if (frameNamed(move.to) === undefined) {
					depsRef.current.landOn(move.to);
					return;
				}
				const target = frameNamed(move.to);
				const cam = camera.get();
				const size = viewSize();
				select(move.to, null);
				if (target !== undefined && cam !== null && size !== null)
					camera.fly(revealCamera(cam, target, size.w, size.h));
				return;
			}
			const origin = move.replace && move.fork !== null ? move.fork.from : at;
			taken.current = [
				...(move.replace ? taken.current.slice(0, -1) : taken.current),
				{ from: origin, to: move.to },
			];
			const all = depsRef.current.store.get().frames;
			const was = all.find((frame) => frame.name === origin);
			const to = all.find((frame) => frame.name === move.to);
			walkTo(move.to);
			const note = move.fork === null ? null : forkNote(move.fork, formatCombo("bracketright"));
			landed(at, move.to, was !== undefined && to !== undefined ? sideOf(was, to) : null, note);
		},
		[say, frameNamed, viewSize, landed],
	);

	/** ⌘[: back the way you came while live. */
	const walkBack = useCallback(
		(event?: KeyboardEvent) => {
			const { store, walkTo } = depsRef.current;
			const entered = store.get().entered;
			if (entered === null) return;
			event?.preventDefault();
			fork.current = null;
			const move = threadBack(entered, taken.current, store.get().edges);
			if (move.kind === "none") {
				say(entered, move.note);
				return;
			}
			taken.current = move.taken;
			const all = depsRef.current.store.get().frames;
			const was = all.find((frame) => frame.name === entered);
			const to = all.find((frame) => frame.name === move.to);
			walkTo(move.to);
			landed(entered, move.to, was !== undefined && to !== undefined ? sideOf(was, to) : null, null);
		},
		[say, landed],
	);

	/** The accel modifier moved: a fork stays open only while the ⌘ that opened it is held. */
	const accel = useCallback((held: boolean, fresh: boolean) => {
		if (held && !fresh) return;
		if (fork.current === null) return;
		fork.current = null;
		setChip((current) => (current === null || current.note === null ? current : { ...current, note: null }));
	}, []);

	/** A walk the frame took itself (its data-go): part of the way you came, for ⌘[. */
	const noteWalk = useCallback((from: string, to: string) => {
		if (from === to) return;
		taken.current = [...taken.current, { from, to }];
		leftLive.current = { from, to };
	}, []);

	/** Whether a relayed move comes from the frame that is live, or the one a move just left. */
	const fromLive = useCallback((frame: string) => {
		const left = leftLive.current;
		// the landed frame speaking means it holds the keyboard now
		if (left !== null && frame === left.to) leftLive.current = null;
		return frame === depsRef.current.store.get().entered || frame === leftLive.current?.from;
	}, []);

	/**
	 * A frame's document (re)booted. The one a move landed on has the keyboard
	 * from here, so the frame it left no longer speaks for it; and an overview
	 * opened on a document that is gone has no ⌥ left to come up.
	 */
	const loaded = useCallback(
		(frame: string) => {
			if (leftLive.current?.to === frame) leftLive.current = null;
			const current = overviewRef.current;
			if (current !== null && current.mode === "live" && current.origin === frame) cancel();
		},
		[cancel],
	);

	// the overview opened inside a frame goes when that frame stops being live
	// some other way (Esc, a click on the field)
	const entered = useCanvasState(deps.store, (state) => state.entered);
	useEffect(() => {
		const current = overviewRef.current;
		if (entered === null) leftLive.current = null;
		if (current !== null && current.mode === "live" && entered !== current.origin) {
			hold.cancel();
			setOverview(null);
			depsRef.current.camera.fly(current.saved, OVERVIEW_OPEN_MS);
		}
	}, [entered, hold, setOverview]);

	return {
		overview,
		chip,
		/** ⌥ alone went down (canvas.overview): armed, open once held */
		holdDown: () => {
			if (overviewRef.current === null && overviewOrigin() !== null) hold.down();
		},
		release,
		cancel,
		point,
		pick,
		step,
		walkOn,
		walkBack,
		accel,
		landLive,
		noteWalk,
		fromLive,
		loaded,
		/** whether the overview is up on screen, not just armed */
		isShown: () => overviewRef.current !== null,
		isOpen: () => overviewRef.current !== null || hold.armed,
	};
}
