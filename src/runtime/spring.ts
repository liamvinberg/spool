/**
 * Springs for the player's chrome (spool#264), solved the way Motion solves
 * them, so the numbers the design names in `player-size-model.ts` move the
 * built player as they move the drawn one. Hand-ported rather than imported:
 * Motion would ride into every frame's runtime, which draws the player too.
 */

/** A spring as the design gives one: by its physics, or by how long it looks and how much it bounces. */
export type SpringOptions =
	| { stiffness: number; damping: number; mass?: number; restDelta?: number; restSpeed?: number }
	| { visualDuration: number; bounce: number };

interface Physics {
	stiffness: number;
	damping: number;
	mass: number;
	restDelta?: number;
	restSpeed?: number;
}

function physics(options: SpringOptions): Physics {
	if ("visualDuration" in options) {
		const root = (2 * Math.PI) / (options.visualDuration * 1.2);
		const stiffness = root * root;
		return {
			stiffness,
			damping: 2 * Math.min(1, Math.max(0.05, 1 - options.bounce)) * Math.sqrt(stiffness),
			mass: 1,
		};
	}
	return { mass: 1, ...options };
}

/**
 * A spring from `from` to `to`, leaving at `velocity` units a second: where it
 * is `t` seconds in, how fast it is going, and whether it has come to rest,
 * which it does exactly on `to`.
 */
export function spring(
	options: SpringOptions,
	from: number,
	to: number,
	velocity: number,
): (t: number) => { value: number; velocity: number; done: boolean } {
	const { stiffness, damping, mass, restDelta, restSpeed } = physics(options);
	const delta = to - from;
	const granular = Math.abs(delta) < 5;
	const restAt = restDelta ?? (granular ? 0.005 : 0.5);
	const stillAt = restSpeed ?? (granular ? 0.01 : 2);
	const ratio = damping / (2 * Math.sqrt(stiffness * mass));
	const natural = Math.sqrt(stiffness / mass);
	// the solution is written in the distance still to go, so the speed is the other way round
	const v0 = -velocity;
	let at: (t: number) => number;
	if (ratio < 1) {
		const damped = natural * Math.sqrt(1 - ratio * ratio);
		at = (t) =>
			to -
			Math.exp(-ratio * natural * t) *
				(((v0 + ratio * natural * delta) / damped) * Math.sin(damped * t) + delta * Math.cos(damped * t));
	} else if (ratio === 1) {
		at = (t) => to - Math.exp(-natural * t) * (delta + (v0 + natural * delta) * t);
	} else {
		const damped = natural * Math.sqrt(ratio * ratio - 1);
		at = (t) => {
			const envelope = Math.exp(-ratio * natural * t);
			const angle = Math.min(damped * t, 300);
			return (
				to -
				(envelope * ((v0 + ratio * natural * delta) * Math.sinh(angle) + damped * delta * Math.cosh(angle))) /
					damped
			);
		};
	}
	return (t) => {
		const value = at(t);
		const speed = t === 0 ? velocity : (value - at(Math.max(0, t - 0.005))) / Math.min(t, 0.005);
		// an overdamped spring only ever closes in, so how near it is says it all
		const done = Math.abs(to - value) <= restAt && (ratio >= 1 || Math.abs(speed) <= stillAt);
		return { value: done ? to : value, velocity: done ? 0 : speed, done };
	};
}

/**
 * A spring from 0 to 1 at rest as a CSS timing function, for what the chrome
 * moves by transition or animation rather than by hand: the curve sampled
 * every frame as `linear()`, over the time it takes to rest.
 */
export function springEasing(options: SpringOptions): { duration: number; easing: string } {
	const at = spring(options, 0, 1, 0);
	const points: number[] = [];
	let t = 0;
	for (; t < 10; t += 1 / 60) {
		const step = at(t);
		points.push(step.value);
		if (step.done) break;
	}
	const said = points.map((value) => Number(value.toFixed(4)));
	return { duration: Math.round(t * 1000), easing: `linear(${said.join(", ")})` };
}

/** A number the chrome moves: set by hand, or sprung to a target from where it is and as fast as it was going. */
export class Animated {
	private value: number;
	private speed = 0;
	private setAt = 0;
	private frame = 0;
	private readonly listeners = new Set<() => void>();

	constructor(value: number) {
		this.value = value;
	}

	get(): number {
		return this.value;
	}

	/** Whether a spring has it. */
	moving(): boolean {
		return this.frame !== 0;
	}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	/** Follow the hand: the speed it is set at is what a spring started next leaves at. */
	set(value: number): void {
		this.stop();
		const now = performance.now();
		const elapsed = now - this.setAt;
		// a hand still for longer than a frame or two has let go of its speed
		this.speed = elapsed > 0 && elapsed < 30 ? ((value - this.value) / elapsed) * 1000 : 0;
		this.setAt = now;
		this.change(value);
	}

	/** Put it there, with no speed. */
	jump(value: number): void {
		this.stop();
		this.speed = 0;
		this.change(value);
	}

	/** Spring to `to`, or jump there when motion is reduced. */
	to(to: number, options: SpringOptions, still = false): void {
		this.stop();
		if (still || (this.value === to && this.speed === 0)) {
			this.jump(to);
			return;
		}
		const at = spring(options, this.value, to, this.speed);
		const start = performance.now();
		const tick = (now: number) => {
			const step = at(Math.max(0, now - start) / 1000);
			this.speed = step.velocity;
			this.frame = step.done ? 0 : requestAnimationFrame(tick);
			this.change(step.value);
		};
		this.frame = requestAnimationFrame(tick);
	}

	stop(): void {
		if (this.frame !== 0) cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	private change(value: number): void {
		this.value = value;
		for (const listener of this.listeners) listener();
	}
}
