/**
 * The slide's flight while it fills the screen (spool#298): one spring for everything that moves. It is the design's
 * Motion spring, `{ type: "spring", duration, bounce }`: tuned from its duration and bounce as Motion resolves one,
 * so it is within a thousandth of its mark by its duration, and on it then. Aimed again mid-way it turns round from where it is, at
 * the speed it has, never from rest; with no bounce it lands once, never passing its mark.
 */

export interface Tune {
	readonly k: number;
	readonly c: number;
	/** seconds from an aim to the landing, where Motion's spring ends on its mark */
	readonly duration: number;
}

/** Where the envelope of a move from rest has fallen to, by the spring's duration. */
const SETTLED = 0.001;

/**
 * A spring of mass 1 that settles in `duration` seconds with `bounce`, as Motion's `findSpring` makes one: its
 * natural frequency found by Newton's method where the envelope of a move from rest falls to `SETTLED`.
 */
export function tune(duration: number, bounce = 0): Tune {
	const ratio = Math.min(1, Math.max(0.05, 1 - bounce));
	const t = Math.min(10, Math.max(0.01, duration));
	const ringing = Math.sqrt(1 - ratio * ratio);
	const envelope =
		ratio < 1
			? (w: number) => SETTLED - (ratio / ringing) * Math.exp(-w * ratio * t)
			: (w: number) => Math.exp(-w * t) * (w * t + 1) - SETTLED;
	const slope =
		ratio < 1
			? (w: number) => {
					const turn = SETTLED - envelope(w) > 0 ? -1 : 1;
					return (turn * -(ratio * ratio * w * w * t) * Math.exp(-w * ratio * t)) / (w * w * ringing);
				}
			: (w: number) => -Math.exp(-w * t) * w * t * t;
	let w = 5 / t;
	for (let step = 1; step < 12; step++) w -= envelope(w) / slope(w);
	return { k: w * w, c: 2 * ratio * w, duration: t };
}

/** The longest step the integrator takes: the same physics at any frame rate. */
const STEP = 1 / 240;

/** Where the slide stands on the window: its top left and width in pixels, and its corner's radius on screen. */
export interface Pose {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly r: number;
}

const KEYS = ["x", "y", "w", "r"] as const;
/** How near its mark, in pixels, a spring is at rest. */
const REST = 0.25;

export interface Flight {
	/** where the slide stands now */
	pose(): Pose;
	/** go there from where it is, keeping its speed; `landed` once it has, unless it is aimed again first */
	aim(to: Pose, landed?: () => void): void;
	/** there now, at rest */
	set(pose: Pose): void;
	/** the window moved under the slide: it stays where it was on the screen, and its speed with it */
	shift(dx: number, dy: number): void;
	/** run `dt` seconds; true while it moved */
	step(dt: number): boolean;
	resting(): boolean;
}

export function createFlight(from: Pose, spring: Tune): Flight {
	const at = { ...from };
	const to = { ...from };
	const speed = { x: 0, y: 0, w: 0, r: 0 };
	let landed: (() => void) | undefined;
	/** seconds since it was last aimed */
	let flown = 0;
	const resting = () => KEYS.every((key) => at[key] === to[key] && speed[key] === 0);
	return {
		pose: () => ({ ...at }),
		aim(next, then) {
			Object.assign(to, next);
			landed = then;
			flown = 0;
			if (resting()) {
				landed = undefined;
				then?.();
			}
		},
		set(pose) {
			Object.assign(at, pose);
			Object.assign(to, pose);
			Object.assign(speed, { x: 0, y: 0, w: 0, r: 0 });
			landed = undefined;
		},
		shift(dx, dy) {
			at.x += dx;
			at.y += dy;
		},
		step(dt) {
			if (resting()) return false;
			let left = Math.min(dt, 0.064);
			flown += left;
			// on its mark by its duration, as Motion's spring ends
			const over = flown >= spring.duration - 1e-6;
			while (left > 0) {
				const h = Math.min(STEP, left);
				for (const key of KEYS) {
					const a = -spring.k * (at[key] - to[key]) - spring.c * speed[key];
					speed[key] += a * h;
					at[key] += speed[key] * h;
				}
				left -= h;
			}
			for (const key of KEYS) {
				if (over || (Math.abs(at[key] - to[key]) < REST && Math.abs(speed[key]) < REST * 12)) {
					at[key] = to[key];
					speed[key] = 0;
				}
			}
			if (resting()) {
				const then = landed;
				landed = undefined;
				then?.();
			}
			return true;
		},
		resting,
	};
}
