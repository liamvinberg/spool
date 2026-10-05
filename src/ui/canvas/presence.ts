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
	/** One change from the daemon. */
	hear(presence: Presence, now?: number): void;
	/** Forget everyone at once: the stream that told us about them is gone, and a new one says who's here. */
	reset(): void;
	subscribe(listener: () => void): () => void;
}

export function createPresenceRoom(clock: () => number = Date.now): PresenceRoom {
	const people = new Map<string, Teammate>();
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
		hear(presence, now = clock()) {
			const { person, state, still } = presence;
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
			people.set(person.accountId, {
				person,
				state,
				active: at,
				moved: moved ? at : was.moved,
				entered: !gone && was.state.inside === state.inside ? was.entered : at,
				left: null,
			});
			tell();
		},
		reset() {
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
