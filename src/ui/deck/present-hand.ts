/**
 * The hand over the slides filling the screen (spool#298): a moving pointer wakes the bar, and a resting one lets it go.
 * The first move only says where the hand is; a move of `WAKE_PX` or more from where it last counted wakes the bar, and
 * a tremble under it changes nothing. The bar goes `REST_MS` after the hand rests, and stays while the pointer is on it.
 */

/** A hand moved this far from where it last counted wakes the bar. */
export const WAKE_PX = 6;
/** A hand at rest this long lets the bar go. */
export const REST_MS = 1800;

export interface Point {
	readonly x: number;
	readonly y: number;
}

export interface Hand {
	/** the pointer moved to `at`, in the window's pixels */
	move(at: Point): void;
	/** the pointer is on the bar, or has left it */
	hold(on: boolean): void;
	/** the talk is over: nothing more is said */
	stop(): void;
}

export function createHand(onAwake: (awake: boolean) => void): Hand {
	let anchor: Point | null = null;
	let awake = false;
	let held = false;
	let stopped = false;
	let rest: ReturnType<typeof setTimeout> | undefined;
	const say = (next: boolean) => {
		if (next === awake || stopped) return;
		awake = next;
		onAwake(next);
	};
	const restFrom = () => {
		clearTimeout(rest);
		rest = setTimeout(() => {
			if (!held) say(false);
		}, REST_MS);
	};
	return {
		move(at) {
			if (stopped) return;
			if (anchor === null) {
				anchor = at;
				return;
			}
			if (Math.hypot(at.x - anchor.x, at.y - anchor.y) < WAKE_PX) return;
			anchor = at;
			say(true);
			restFrom();
		},
		hold(on) {
			held = on;
			if (!on && awake) restFrom();
		},
		stop() {
			stopped = true;
			clearTimeout(rest);
		},
	};
}
