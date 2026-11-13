/**
 * The presenter's pointer as the room sees it over a live slide (`pointer-halo-press`, picked on the canvas 2026-11-12):
 * a coloured core inside a white ring inside a dark hairline, so one of the three always stands apart from the slide
 * under it. A press sinks it a little; a click that was no hold sends one ring out; with the button held, the wheel
 * turns its colour.
 */

/** The colours the wheel turns through with the button held, red first. */
export const POINTER_COLOURS = ["#ff3b30", "#ff9f0a", "#30d158", "#0a84ff", "#bf5af2"] as const;

/** A press is a hold, not a click, from this long on, or once the hand travels this far, or once the wheel turns. */
export const HOLD_MS = 160;
export const HOLD_PX = 6;
/** Wheel travel that turns one colour, so a trackpad and a notched wheel feel alike. */
export const WHEEL_STEP = 36;

/** What the hand is doing, as the room is told it beside where it is. */
export interface PenState {
	/** the button is down */
	readonly down: boolean;
	/** the colour turned to, an index into `POINTER_COLOURS` */
	readonly colour: number;
	/** clicks that were no hold, counted: each new one sends a ring out */
	readonly taps: number;
}

export interface Pen {
	/** the button went down at x, y (px), at `now` (ms) */
	press(x: number, y: number, now: number): void;
	/** the hand moved to x, y (px) */
	move(x: number, y: number): void;
	/** the button came up at `now` (ms) */
	release(now: number): void;
	/** the wheel moved by `dy` (px): true when the pen took it, the button being down */
	wheel(dy: number): boolean;
	readonly state: PenState;
}

/** The hand's presses, holds, clicks and the colour the wheel turned to. */
export function makePen(): Pen {
	let down: { x: number; y: number; at: number; held: boolean } | null = null;
	let colour = 0;
	let taps = 0;
	let travel = 0;
	return {
		press(x, y, now) {
			down = { x, y, at: now, held: false };
			travel = 0;
		},
		move(x, y) {
			if (down !== null && Math.hypot(x - down.x, y - down.y) > HOLD_PX) down.held = true;
		},
		release(now) {
			if (down === null) return;
			if (!down.held && now - down.at < HOLD_MS) taps += 1;
			down = null;
		},
		wheel(dy) {
			if (down === null) return false;
			down.held = true;
			travel += dy;
			const steps = Math.trunc(travel / WHEEL_STEP);
			travel -= steps * WHEEL_STEP;
			// up turns forward, as a list scrolls back to its top
			const n = POINTER_COLOURS.length;
			colour = (((colour - steps) % n) + n) % n;
			return true;
		},
		get state() {
			return { down: down !== null, colour, taps };
		},
	};
}

/** The pointer's measures on a slide drawn `width` px wide: 18 px across on a 1440 px room, never under 10. */
export function pointerScale(width: number): number {
	return Math.max(10, width / 80) / 18;
}
