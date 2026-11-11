/**
 * The slide's flight while it fills the screen (spool#298): one spring for everything that moves, tuned the way
 * WWDC23 tunes springs, by perceptual duration and bounce (mass 1, stiffness (2π / T)², damping 4π(1 − bounce) / T).
 * Aimed again mid-way it turns round from where it is, at the speed it has, never from rest; with no bounce it lands
 * once, never passing its mark. The design's `spring.ts` is the same physics.
 */

export interface Tune {
	readonly k: number;
	readonly c: number;
}

export const tune = (duration: number, bounce = 0): Tune => ({
	k: ((2 * Math.PI) / duration) ** 2,
	c: (4 * Math.PI * (1 - bounce)) / duration,
});

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
	const resting = () => KEYS.every((key) => at[key] === to[key] && speed[key] === 0);
	return {
		pose: () => ({ ...at }),
		aim(next, then) {
			Object.assign(to, next);
			landed = then;
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
				if (Math.abs(at[key] - to[key]) < REST && Math.abs(speed[key]) < REST * 12) {
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
