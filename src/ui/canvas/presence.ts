import type { Presence, PresencePerson, PresenceState } from "../../team-sync-protocol";

/**
 * Who else is on a team canvas, as this canvas has heard it (DEV-196).
 *
 * The daemon tells the canvas each person's latest state as it changes; everything the canvas draws about
 * them is derived here from that and the clock, on this side: moving, still, idle and gone. Nothing is
 * written anywhere. One person is one account, which the sync object has already settled across their
 * local copies.
 */

/** How long a name stays said after its person stops moving or pressing. */
export const PILL_HOLD_MS = 1_400;
/**
 * How long a person has to change nothing to be idle. The spec leaves it to the build: long enough that
 * reading a frame or thinking isn't idle, short enough that someone who walked away reads as gone soon.
 */
export const IDLE_MS = 60_000;
/** How long someone takes to fade out once they've left. */
export const LEAVE_MS = 400;

export interface Teammate {
	person: PresencePerson;
	/** Where they last were; kept while they fade out after leaving. */
	state: PresenceState;
	/** When anything about them last changed. */
	active: number;
	/** When their pointer last moved, or their press began or ended: what keeps the pill said. */
	moved: number;
	/** When they went inside the frame they're in, which orders the pills docked there. */
	entered: number;
	/** When they left, while they fade out; null while they're here. */
	left: number | null;
}

export interface PresenceRoom {
	/** Everyone here now, and anyone still fading out, in the order they arrived. */
	teammates(): Teammate[];
	get(accountId: string): Teammate | undefined;
	/**
	 * Who an account is, as this canvas last heard of them, here or since gone: what a teammate's
	 * placeholder takes its colour from while its person is away (#378).
	 */
	person(accountId: string): PresencePerson | undefined;
	/** One change from the daemon. */
	hear(presence: Presence, now?: number): void;
	/** Forget everyone at once: the stream that told us about them is gone, and a new one says who's here. */
	reset(): void;
	subscribe(listener: () => void): () => void;
}

export function createPresenceRoom(clock: () => number = Date.now): PresenceRoom {
	const people = new Map<string, Teammate>();
	const heard = new Map<string, PresencePerson>();
	const listeners = new Set<() => void>();
	let sweep: ReturnType<typeof setTimeout> | undefined;
	const tell = () => {
		for (const listener of listeners) listener();
	};
	// someone who left is drawn fading for LEAVE_MS, then forgotten
	const forgetGone = () => {
		sweep = undefined;
		const now = clock();
		let changed = false;
		for (const [id, mate] of people)
			if (mate.left !== null && now - mate.left >= LEAVE_MS) {
				people.delete(id);
				changed = true;
			}
		if ([...people.values()].some((mate) => mate.left !== null)) sweep = setTimeout(forgetGone, LEAVE_MS);
		if (changed) tell();
	};
	return {
		teammates: () => [...people.values()],
		get: (accountId) => people.get(accountId),
		person: (accountId) => heard.get(accountId),
		hear(presence, now = clock()) {
			const { person, state, still } = presence;
			heard.set(person.accountId, person);
			const was = people.get(person.accountId);
			if (state === null) {
				if (was === undefined || was.left !== null) return;
				people.set(person.accountId, { ...was, left: now });
				sweep ??= setTimeout(forgetGone, LEAVE_MS);
				tell();
				return;
			}
			const at = now - still;
			const gone = was === undefined || was.left !== null;
			const moved =
				gone ||
				was.state.pressed !== state.pressed ||
				was.state.pointer?.x !== state.pointer?.x ||
				was.state.pointer?.y !== state.pointer?.y;
			// their agent at work is not them at work: only their own moves keep them from going idle (#378)
			const agentOnly = !gone && agentAlone(was.state, state);
			people.set(person.accountId, {
				person,
				state,
				active: agentOnly ? was.active : at,
				moved: moved ? at : was.moved,
				entered: !gone && was.state.inside === state.inside ? was.entered : at,
				left: null,
			});
			tell();
		},
		reset() {
			if (sweep !== undefined) clearTimeout(sweep);
			sweep = undefined;
			if (people.size === 0) return;
			people.clear();
			tell();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/** the one thing that changed between two states is what their agent is doing */
function agentAlone(was: PresenceState, now: PresenceState): boolean {
	const { agent: before, ...one } = was;
	const { agent: after, ...other } = now;
	return JSON.stringify(before) !== JSON.stringify(after) && JSON.stringify(one) === JSON.stringify(other);
}

/** Their name is said: they're moving or pressing, or stopped less than `PILL_HOLD_MS` ago. */
export function speaking(mate: Teammate, now: number): boolean {
	return mate.state.pressed || now - mate.moved < PILL_HOLD_MS;
}

export function idle(mate: Teammate, now: number): boolean {
	return now - mate.active >= IDLE_MS;
}

/** The next moment something derived about anyone changes by the clock alone, or undefined for never. */
export function nextChange(mates: readonly Teammate[], now: number): number | undefined {
	let next: number | undefined;
	const consider = (at: number) => {
		if (at > now && (next === undefined || at < next)) next = at;
	};
	for (const mate of mates) {
		if (mate.left !== null) continue;
		consider(mate.moved + PILL_HOLD_MS);
		consider(mate.active + IDLE_MS);
	}
	return next;
}

/** What their agent is doing, in a few words, while a turn of theirs runs on this project (#378); null otherwise. */
export function agentSays(mate: Teammate): string | null {
	const agent = mate.state.agent;
	if (agent === undefined) return null;
	if (!agent.running) return "agent waiting";
	return agent.status ?? "agent working";
}

/** "idle · 4m": how long someone has been idle, said the way the who's-here list says it. */
export function idleFor(mate: Teammate, now: number): string {
	const minutes = Math.floor((now - mate.active) / 60_000);
	if (minutes < 60) return `idle · ${Math.max(1, minutes)}m`;
	return `idle · ${Math.floor(minutes / 60)}h`;
}

/** The world point their canvas centres, and the zoom that shows their whole view in a viewport this size. */
export function followCamera(
	view: { x: number; y: number; w: number; h: number },
	viewport: { width: number; height: number },
): { x: number; y: number; k: number } {
	const k = Math.min(viewport.width / Math.max(view.w, 1), viewport.height / Math.max(view.h, 1));
	return {
		k,
		x: viewport.width / 2 - (view.x + view.w / 2) * k,
		y: viewport.height / 2 - (view.y + view.h / 2) * k,
	};
}

/**
 * One step of a critically damped spring toward a goal: it eases in and settles without ever passing it.
 * `w` is how quick, in radians a second.
 */
export function springStep(
	value: { p: number; v: number },
	goal: number,
	dt: number,
	w: number,
): { p: number; v: number } {
	// the exact solution for one step of a critically damped spring, so a long frame can't overshoot either
	const x = value.p - goal;
	const e = Math.exp(-w * dt);
	const c = value.v + w * x;
	return { p: goal + (x + c * dt) * e, v: (value.v - w * c * dt) * e };
}

/** How long a click's squash and burst take; `presence-burst` in `ui.css` runs the same. */
export const CLICK_MS = 460;
/** How long after the last scroll their pointer stays a scrolling mouse. */
export const SCROLL_MS = 450;
/** How long a drag's line lingers behind the pointer. */
export const TRAIL_MS = 650;
/** How far a press moves, in world units, before it's a drag rather than a click. */
export const DRAG_SLOP = 4;

export type ScrollWay = "up" | "down" | "left" | "right";

/**
 * What a teammate's pointer is doing inside the live frame they're in, as this canvas has followed it: their
 * clicks, a drag and the line it leaves, a scroll and which way. Nothing in the frame itself is shared, so
 * this is all anyone sees of what they do there. Derived from their presence render by render, and kept
 * only on this side.
 */
export interface PointerGesture {
	/** Their click count as last heard, which a new click passes. */
	clicks: number;
	/** The latest click: `n` counts them, so each one gets its own animation. */
	click: { n: number; at: number } | null;
	pressed: boolean;
	/** Where the press began, in world units. */
	origin: { x: number; y: number } | null;
	dragging: boolean;
	/** Where the drawn pointer has been lately while dragging, in world units. */
	trail: { x: number; y: number; at: number }[];
	scrolled: { x: number; y: number } | null;
	scroll: { way: ScrollWay; at: number } | null;
}

/**
 * The gesture one more render of their presence makes. `drawn` is where their pointer is drawn now, which
 * the line behind a drag follows, so it's as smooth as the pointer; null until it's been drawn.
 */
export function followGesture(
	was: PointerGesture | undefined,
	state: PresenceState,
	drawn: { x: number; y: number } | null,
	now: number,
): PointerGesture {
	const clicks = state.clicks ?? 0;
	const scrolled = state.inside === null ? null : (state.scrolled ?? null);
	const pressed = state.pressed && state.inside !== null;
	// first seen, or out on the canvas: what they've done so far is where counting starts, not something to show
	if (was === undefined || state.inside === null)
		return {
			clicks,
			click: null,
			pressed,
			origin: pressed ? state.pointer : null,
			dragging: false,
			trail: [],
			scrolled,
			scroll: null,
		};
	const pointer = state.pointer;
	const click = clicks > was.clicks ? { n: (was.click?.n ?? 0) + 1, at: now } : was.click;
	const origin = pressed && !was.pressed ? pointer : pressed ? was.origin : null;
	const dragging =
		pressed &&
		(was.dragging ||
			(origin !== null && pointer !== null && Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > DRAG_SLOP));
	const trail = was.trail.filter((point) => now - point.at < TRAIL_MS);
	const last = trail.at(-1);
	if (dragging && drawn !== null && (last === undefined || Math.hypot(last.x - drawn.x, last.y - drawn.y) > 0.5))
		trail.push({ ...drawn, at: now });
	let scroll = was.scroll;
	if (scrolled !== null && was.scrolled !== null) {
		const dx = scrolled.x - was.scrolled.x;
		const dy = scrolled.y - was.scrolled.y;
		if (dx !== 0 || dy !== 0)
			scroll = {
				way: Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? "down" : "up") : dx > 0 ? "right" : "left",
				at: now,
			};
	}
	return { clicks, click, pressed, origin, dragging, trail, scrolled, scroll };
}

/** Whether something about a gesture is still moving by the clock alone, so it wants another frame drawn. */
export function gestureMoving(gesture: PointerGesture, now: number): boolean {
	return (
		gesture.trail.length > 0 ||
		(gesture.click !== null && now - gesture.click.at < CLICK_MS) ||
		(gesture.scroll !== null && now - gesture.scroll.at < SCROLL_MS)
	);
}

/** The shape their pointer takes: a hand while it drags, a mouse while it scrolls, a pressed arrow while held. */
export function pointerShape(gesture: PointerGesture, now: number): "arrow" | "pressed" | "hand" | "scroll" {
	if (gesture.dragging) return "hand";
	if (gesture.scroll !== null && now - gesture.scroll.at < SCROLL_MS) return "scroll";
	return gesture.pressed ? "pressed" : "arrow";
}
