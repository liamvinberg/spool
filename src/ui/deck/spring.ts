/**
 * One running spring (spool#299, the prototype's `spring.ts`): a value, its velocity and where it is going. Given a
 * new target mid-flight it turns round from where it is at the speed it has, never from rest; handed a velocity, the
 * motion carries on from it.
 *
 * Tuned the way WWDC23 tunes springs, by perceptual duration and bounce: mass 1, stiffness (2π / T)², damping
 * 4π(1 − bounce) / T. Duration 0.5 s and bounce 0.3 are stiffness 157.9 and damping 17.6, as Apple's `Spring` says.
 */

/** A spring's stiffness and damping, mass 1. A duration of nothing is no spring: it is set, not run. */
export interface Tune {
	readonly k: number;
	readonly c: number;
}

/** The spring that takes `duration` seconds to land, overshooting by `bounce` (0 never does). */
export const tune = (duration: number, bounce = 0): Tune =>
	duration <= 0
		? { k: Number.POSITIVE_INFINITY, c: 0 }
		: { k: ((2 * Math.PI) / duration) ** 2, c: (4 * Math.PI * (1 - bounce)) / duration };

/** The longest step the integrator takes: the same physics at any frame rate. */
const STEP = 1 / 240;
/** The most one call runs, so a page that was away for a while lands rather than leaps. */
const MOST = 0.064;

export class Spring {
	x: number;
	v = 0;
	to: number;
	t: Tune;

	constructor(x: number, t: Tune) {
		this.x = x;
		this.to = x;
		this.t = t;
	}

	/** There now, at rest. */
	set(x: number): void {
		this.x = x;
		this.to = x;
		this.v = 0;
	}

	/** Go there from where it is, keeping its speed, or taking `v` as its speed. */
	aim(to: number, t: Tune = this.t, v?: number): void {
		this.to = to;
		this.t = t;
		if (v !== undefined) this.v = v;
		if (!Number.isFinite(t.k)) this.set(to);
	}

	get resting(): boolean {
		return this.x === this.to && this.v === 0;
	}

	/** Run `dt` seconds; it settles exactly once, within `eps` and barely moving. True while it moved. */
	step(dt: number, eps: number): boolean {
		if (this.resting) return false;
		let left = Math.min(dt, MOST);
		while (left > 0) {
			const h = Math.min(STEP, left);
			const a = -this.t.k * (this.x - this.to) - this.t.c * this.v;
			this.v += a * h;
			this.x += this.v * h;
			left -= h;
		}
		if (Math.abs(this.x - this.to) < eps && Math.abs(this.v) < eps * 12) {
			this.x = this.to;
			this.v = 0;
		}
		return true;
	}
}
