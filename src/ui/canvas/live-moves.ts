import { pageName } from "../../page-path";
import type { Camera, FlowEdge, ProjectedFrame } from "../api";
import { type Box, boundsOf, fitCamera } from "./camera";
import { nextSpatialFrame, type SpatialDirection, type SpatialTrail, stepSpatially } from "./spatial-navigation";

/**
 * Moving between frames while one is live (DEV-295), as plain data: the ⌥
 * overview's hold and its target, where its camera stands, and the walk along
 * the threads with its forks. The canvas holds the state and does the moving;
 * everything here answers what the next state is.
 */

/** How long ⌥ alone is held before the overview opens: a ⌥ chord is quicker. */
export const OVERVIEW_HOLD_MS = 120;
/** The camera's ease out to the overview, and between its targets. */
export const OVERVIEW_OPEN_MS = 200;

/** Which way a key steps: arrows by key, hjkl by place (⌥ spells the letter as something else). */
export function stepDirection(event: { key: string; code: string }): SpatialDirection | undefined {
	switch (event.key) {
		case "ArrowLeft":
			return "left";
		case "ArrowRight":
			return "right";
		case "ArrowUp":
			return "up";
		case "ArrowDown":
			return "down";
	}
	switch (event.code) {
		case "KeyH":
			return "left";
		case "KeyJ":
			return "down";
		case "KeyK":
			return "up";
		case "KeyL":
			return "right";
	}
	return undefined;
}

/**
 * ⌥ held alone: armed on the way down, open once it has been held
 * `OVERVIEW_HOLD_MS` with nothing else pressed. Any other key, a press of the
 * pointer, or the window losing focus disarms it; the step keys open it at
 * once instead, which the canvas does itself.
 */
export interface AltHold {
	down(): void;
	/** ⌥ came up: whether the hold had opened by then */
	up(): boolean;
	cancel(): void;
	readonly armed: boolean;
}

export function createAltHold(onHold: () => void, holdMs = OVERVIEW_HOLD_MS): AltHold {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let opened = false;
	const clear = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	};
	return {
		down() {
			if (timer !== null || opened) return;
			timer = setTimeout(() => {
				timer = null;
				opened = true;
				onHold();
			}, holdMs);
		},
		up() {
			const was = opened;
			clear();
			opened = false;
			return was;
		},
		cancel() {
			clear();
			opened = false;
		},
		get armed() {
			return timer !== null;
		},
	};
}

/** A press toward nothing: the target shoves that way and says so. */
interface OverviewBump {
	direction: SpatialDirection;
	at: string;
	n: number;
}

/**
 * The overview while ⌥ is held: where it opened, where letting go lands,
 * and the camera to go back to.
 *
 * `live` opened inside a frame and letting go enters the target; `select`
 * opened on a frame selected out on the canvas and letting go selects it.
 */
export interface Overview {
	mode: "live" | "select";
	origin: string;
	target: string;
	trail: SpatialTrail | null;
	bump: OverviewBump | null;
	/** the side the target was reached from, for the landing */
	came: SpatialDirection | null;
	/** the camera the overview stepped back from, which letting go returns to */
	saved: Camera;
}

export function openOverview(mode: Overview["mode"], origin: string, saved: Camera): Overview {
	return { mode, origin, target: origin, trail: null, bump: null, came: null, saved };
}

/** One arrow while the overview is up: the spatial step from the target, step-back memory included. */
export function moveOverview(
	overview: Overview,
	frames: readonly ProjectedFrame[],
	direction: SpatialDirection,
): Overview {
	const from = frames.find((frame) => frame.name === overview.target);
	const step = from === undefined ? undefined : stepSpatially(from, frames, direction, overview.trail);
	if (step === undefined) {
		return { ...overview, bump: { direction, at: overview.target, n: (overview.bump?.n ?? 0) + 1 } };
	}
	return { ...overview, target: step.target.name, trail: step.trail, came: direction };
}

export type OverviewLanding =
	| { kind: "enter"; target: string; came: SpatialDirection | null }
	| { kind: "stay"; target: string }
	| { kind: "select"; target: string };

/** Letting go of ⌥: into the target, back where it opened, or the target selected. */
export function landOverview(overview: Overview): OverviewLanding {
	if (overview.mode === "select") return { kind: "select", target: overview.target };
	if (overview.target === overview.origin) return { kind: "stay", target: overview.origin };
	return { kind: "enter", target: overview.target, came: overview.came };
}

/** The nearest frame each way from one: what one press of an arrow reaches. */
export function overviewNeighbours(
	target: ProjectedFrame,
	frames: readonly ProjectedFrame[],
): Partial<Record<SpatialDirection, ProjectedFrame>> {
	const around: Partial<Record<SpatialDirection, ProjectedFrame>> = {};
	for (const direction of ["left", "right", "up", "down"] as const) {
		const next = nextSpatialFrame(target, frames, direction);
		if (next !== undefined) around[direction] = next;
	}
	return around;
}

/**
 * Where the overview stands: the target and its nearest neighbour each way,
 * fitted, and never closer than the camera it stepped back from.
 */
export function overviewCamera(
	target: ProjectedFrame,
	frames: readonly ProjectedFrame[],
	saved: Camera,
	vw: number,
	vh: number,
): Camera {
	const boxes: Box[] = [target, ...Object.values(overviewNeighbours(target, frames))];
	const fit = fitCamera(boundsOf(boxes), vw, vh);
	if (fit.k <= saved.k) return fit;
	// already far enough out: stay at this zoom, the target in the middle
	return {
		k: saved.k,
		x: vw / 2 - (target.x + target.w / 2) * saved.k,
		y: vh / 2 - (target.y + target.h / 2) * saved.k,
	};
}

/** The side of `from` that `to` lies on, for a chip that slides in from where you came. */
export function sideOf(from: Box, to: Box): SpatialDirection {
	const dx = to.x + to.w / 2 - (from.x + from.w / 2);
	const dy = to.y + to.h / 2 - (from.y + from.h / 2);
	if (Math.abs(dx) / Math.max(from.w, 1) >= Math.abs(dy) / Math.max(from.h, 1)) return dx >= 0 ? "right" : "left";
	return dy >= 0 ? "down" : "up";
}

/* ------------------------------------------------------------- threads -- */

/** A thread taken while live, newest last: what ⌘[ walks back along. */
export interface ThreadStep {
	from: string;
	to: string;
}

/** A fork ⌘] is cycling: ] again before ⌘ comes up takes the next option. */
export interface ThreadFork {
	from: string;
	options: readonly string[];
	index: number;
}

/** The threads out of a frame, in the flow map's order, each target once. */
export function threadsFrom(at: string, edges: readonly FlowEdge[]): string[] {
	const out: string[] = [];
	for (const edge of edges) {
		if (edge.from !== at || edge.missing === true || edge.to === at || out.includes(edge.to)) continue;
		out.push(edge.to);
	}
	return out;
}

export type ThreadMove =
	| { kind: "walk"; to: string; fork: ThreadFork | null; replace: boolean }
	| { kind: "none"; note: string };

/**
 * ⌘]: on along the thread. One thread out walks it; a fork walks the first
 * and holds the fork open, so a ] again while ⌘ is still down swaps the walk
 * to the next thread instead of going on from where it landed.
 */
export function threadNext(at: string, edges: readonly FlowEdge[], fork: ThreadFork | null): ThreadMove {
	if (fork !== null && fork.options[fork.index] === at && fork.options.length > 1) {
		const index = (fork.index + 1) % fork.options.length;
		return { kind: "walk", to: fork.options[index] as string, fork: { ...fork, index }, replace: true };
	}
	const out = threadsFrom(at, edges);
	const [first] = out;
	if (first === undefined) return { kind: "none", note: "end of the thread" };
	return {
		kind: "walk",
		to: first,
		fork: out.length > 1 ? { from: at, options: out, index: 0 } : null,
		replace: false,
	};
}

/**
 * ⌘[: back the way you came, while the way you came still ends here; else
 * back along the first thread into this frame.
 */
export function threadBack(
	at: string,
	taken: readonly ThreadStep[],
	edges: readonly FlowEdge[],
): { kind: "walk"; to: string; taken: ThreadStep[] } | { kind: "none"; note: string } {
	const last = taken.at(-1);
	if (last !== undefined && last.to === at) return { kind: "walk", to: last.from, taken: taken.slice(0, -1) };
	const into = edges.find((edge) => edge.to === at && edge.from !== at && edge.missing !== true);
	if (into === undefined) return { kind: "none", note: "start of the thread" };
	return { kind: "walk", to: into.from, taken: [] };
}

/** What the live chip says at a fork: which thread of how many, and what ] again takes. */
export function forkNote(fork: ThreadFork, bracket: string): string {
	const next = fork.options[(fork.index + 1) % fork.options.length] ?? "";
	return `${fork.index + 1} of ${fork.options.length} · ${bracket} again for ${pageName(next)}`;
}

/** What the overview says on a press toward nothing. */
export function nothingThat(direction: SpatialDirection): string {
	return direction === "up" ? "nothing above" : direction === "down" ? "nothing below" : `nothing to the ${direction}`;
}
