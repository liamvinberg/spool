import { cubicBezier } from "motion/react";
import { useState } from "react";
import type { CanvasStore } from "../canvas/canvas-store";
import type { DrawnFrame, FrameMotion } from "../canvas/frame-motion";
import { Spring, type Tune, tune } from "./spring";

/** A cubic Bézier's four numbers, as motion's `ease` takes them. */
export type Curve = readonly [number, number, number, number];

/**
 * The deck's motion as the page has it (spool#265): the theme's curves and scale, and the deck's own timings and
 * springs, its prototype's numbers kept as `--motion-deck-*` in `theme.css`. Durations are in ms. A page that carries
 * no theme, as a unit test's, has none of them: nothing takes any time, on a straight line.
 */
export interface DeckMotion {
	readonly snap: Curve;
	readonly out: Curve;
	readonly base: number;
	readonly slow: number;
	readonly slower: number;
	/** frames making room on a deck page, the springs it moves on (spool#299) */
	readonly room: Tune;
	/** frames making room while the band scrolls under the hand: quicker, so the gap stays under it */
	readonly rush: Tune;
	/** a frame let go, landing from the hand */
	readonly land: Tune;
	/** a frame lifting into the hand, and setting down */
	readonly lift: Tune;
	/** the camera going into a slide and back out, on the snap curve */
	readonly fly: number;
	/** the camera bringing a frame chosen in Pages or by the arrows just inside the view, on the snap curve */
	readonly reveal: number;
	/** Present: how long the slide waits for the chrome to start going, and then takes to reach the presenter view */
	readonly leaveWait: number;
	readonly leave: number;
	/** End: how long the slide takes to travel home, and how long the chrome waits to follow it */
	readonly return: number;
	readonly chromeWait: number;
	/** how long after the slide the presenter view's head, side and foot each start to arrive */
	readonly arrive: { readonly head: number; readonly side: number; readonly foot: number };
	/** a beat's notes giving way to the next, on the snap curve */
	readonly notes: number;
	/** the spring the presenter's pointer follows the hand on */
	readonly pointer: { readonly stiffness: number; readonly damping: number; readonly mass: number };
}

const LINE: Curve = [0, 0, 1, 1];

export function deckMotion(root: Element = document.documentElement): DeckMotion {
	const style = getComputedStyle(root);
	const numbers = (name: string) =>
		(style.getPropertyValue(name).match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
	const ms = (name: string) => {
		const value = style.getPropertyValue(name).trim();
		const [n = 0] = numbers(name);
		return value.endsWith("ms") ? n : n * 1000;
	};
	const curve = (name: string): Curve => {
		const [a, b, c, d] = numbers(name);
		return a === undefined || b === undefined || c === undefined || d === undefined ? LINE : [a, b, c, d];
	};
	/** a spring given as its duration and its bounce */
	const spring = (name: string): Tune => {
		const [duration = 0, bounce = 0] = numbers(name);
		return tune(/^\s*[\d.]+ms/.test(style.getPropertyValue(name)) ? duration / 1000 : duration, bounce);
	};
	const [stiffness = 0, damping = 0, mass = 1] = numbers("--motion-deck-pointer");
	return {
		snap: curve("--ease-snap"),
		out: curve("--ease-out"),
		base: ms("--transition-duration-base"),
		slow: ms("--transition-duration-slow"),
		slower: ms("--transition-duration-slower"),
		room: spring("--motion-deck-room"),
		rush: spring("--motion-deck-rush"),
		land: spring("--motion-deck-land"),
		lift: spring("--motion-deck-lift"),
		fly: ms("--motion-deck-fly"),
		reveal: ms("--motion-deck-reveal"),
		leaveWait: ms("--motion-deck-leave-wait"),
		leave: ms("--motion-deck-leave"),
		return: ms("--motion-deck-return"),
		chromeWait: ms("--motion-deck-chrome-wait"),
		arrive: {
			head: ms("--motion-deck-arrive-head"),
			side: ms("--motion-deck-arrive-side"),
			foot: ms("--motion-deck-arrive-foot"),
		},
		notes: ms("--motion-deck-notes"),
		pointer: { stiffness, damping, mass },
	};
}

/** The deck's motion for a component's life, read as it mounts. */
export function useDeckMotion(): DeckMotion {
	return useState(() => deckMotion())[0];
}

/** A curve as a function of time, for a script that moves a thing itself. */
export const easing = (curve: Curve) => cubicBezier(...curve);

export interface Point {
	readonly x: number;
	readonly y: number;
}

/** How much larger a frame lifted in the hand is drawn. */
export const LIFTED = 1.045;

/** A goal no read has agreed with in this long is let go, so a write the daemon never made cannot hold a frame. */
export const HOLD_MS = 4000;

/** What runs in each animation frame while a hand holds frames, around the springs' own step. */
export interface Hand {
	/** before the springs step: where the held frames are now, and what letting go would do */
	frame(dt: number): void;
	/** after the frame is drawn: what moves the camera for the next one */
	after(dt: number): void;
}

/**
 * A deck page's frames on springs (spool#299, the prototype's `DeckDrag`): every frame that moves runs on its own,
 * and a spring given a new place mid-flight turns round from where it is at the speed it has. Frames in the hand are
 * drawn where the hand has them, lifted. It runs outside React: each animation frame it steps the springs and tells
 * its listeners, which draw the frames where it has them (`FrameMotion`), and React hears nothing.
 *
 * Where a frame stands is the canvas's store, which this writes once, as a hand lets go, with the places the frames are
 * going to; until a read of the disk has them there too, `keep` holds them over any read that does not.
 */
export interface FrameSprings extends FrameMotion {
	/**
	 * Frames named to their places from where they are drawn, on `spring`; a frame still landing keeps its landing.
	 * Nothing is written: a preview's places are drawn, never stood in.
	 */
	place(goals: ReadonlyMap<string, Point>, spring: "room" | "rush"): void;
	/**
	 * Frames in the hand, their top lefts this frame, the hand on the page at `grab`: the first time, each lifts,
	 * growing about the point the hand has it by, and is drawn over every other.
	 */
	hold(at: ReadonlyMap<string, Point>, grab: Point): void;
	/** What runs in each frame while the hand holds; null once it lets go. */
	steer(hand: Hand | null): void;
	/**
	 * Every frame named goes to its place and stands there: the store has it there at once, and a read holds it there
	 * until the disk agrees. Frames in the hand land, from where it let go at `velocity` (page pixels a second);
	 * `landed` hears once they rest.
	 */
	settle(goals: ReadonlyMap<string, Point>, velocity?: Point, landed?: () => void): void;
	/** Everything stops where it stands, and nothing more is drawn other than where the store has it. */
	stop(): void;
	/**
	 * Frames as a read of the disk has them, with the ones this has settled where it settled them: a read that lands
	 * before the daemon has written the place never moves a frame back. A frame lets go once a read has it at its place,
	 * or has it at another size, which no place of the old size can speak for, or once `HOLD_MS` has passed.
	 */
	keep<F extends Frame>(read: readonly F[]): F[];
}

interface Frame extends Point {
	readonly name: string;
	readonly w: number;
	readonly h: number;
}

interface Body {
	readonly x: Spring;
	readonly y: Spring;
	/** its scale, and its lift: 0 resting, 1 in the hand */
	readonly s: Spring;
	readonly up: Spring;
	origin: Point;
	/** drawn over every other: in the hand, and landing until it rests */
	top: boolean;
	held: Point | null;
}

const stillness = () =>
	typeof window !== "undefined" &&
	typeof window.matchMedia === "function" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The springs come to rest within this many screen pixels, barely moving. */
const REST_PX = 0.08;

export function createFrameSprings(
	store: CanvasStore,
	zoom: () => number,
	still = stillness,
	now = () => performance.now(),
	timing: () => DeckMotion = deckMotion,
): FrameSprings {
	const bodies = new Map<string, Body>();
	/** each place settled, and until when a read that disagrees is held to it */
	const goals = new Map<string, { at: Point; until: number }>();
	const listeners = new Set<() => void>();
	let hand: Hand | null = null;
	let landing: { names: ReadonlySet<string>; landed: () => void } | null = null;
	let frame = 0;
	let last = 0;
	let springs: DeckMotion | null = null;
	/** read once a gesture, never a frame: the theme is a style, and reading one mid-frame can cost a recalc */
	const tunes = () => {
		springs ??= timing();
		return springs;
	};

	const standing = (name: string): Point | undefined => {
		const one = store.get().frames.find((frame) => frame.name === name);
		return one === undefined ? undefined : { x: one.x, y: one.y };
	};
	const bodyOf = (name: string): Body | undefined => {
		const known = bodies.get(name);
		if (known !== undefined) return known;
		const at = standing(name);
		if (at === undefined) return undefined;
		const lift = tunes().lift;
		const made: Body = {
			x: new Spring(at.x, tunes().room),
			y: new Spring(at.y, tunes().room),
			s: new Spring(1, lift),
			up: new Spring(0, lift),
			origin: { x: 0, y: 0 },
			top: false,
			held: null,
		};
		bodies.set(name, made);
		return made;
	};
	const aim = (spring: Spring, to: number, t: Tune, v?: number) => {
		if (still()) spring.set(to);
		else if (spring.to !== to || v !== undefined) spring.aim(to, t, v);
	};
	/** A frame in the hand let go: it lands on `to` from where the hand left it, at the hand's speed. */
	const letGo = (one: Body, held: Point, to: Point, velocity: Point) => {
		const { land, lift } = tunes();
		one.x.set(held.x);
		one.y.set(held.y);
		one.held = null;
		aim(one.x, to.x, land, velocity.x);
		aim(one.y, to.y, land, velocity.y);
		aim(one.s, 1, land);
		aim(one.up, 0, lift);
	};
	const tell = () => {
		for (const listener of listeners) listener();
	};
	/** in a frame's step, which asks for the next frame itself once it has run */
	let ticking = false;
	const wake = () => {
		if (frame !== 0 || ticking) return;
		last = now();
		frame = requestAnimationFrame(tick);
	};
	const tick = (time: number) => {
		frame = 0;
		ticking = true;
		const dt = Math.min(0.05, Math.max(0, (time - last) / 1000));
		last = time;
		const steering = hand;
		steering?.frame(dt);
		const eps = REST_PX / Math.max(zoom(), 1e-6);
		let moving = steering !== null;
		for (const [name, one] of bodies) {
			let stepped = false;
			if (one.held === null) {
				stepped = one.x.step(dt, eps) || stepped;
				stepped = one.y.step(dt, eps) || stepped;
			}
			stepped = one.s.step(dt, 0.0004) || stepped;
			stepped = one.up.step(dt, 0.002) || stepped;
			if (stepped || one.held !== null) {
				moving = true;
				continue;
			}
			one.top = false;
			// at rest where it stands, with no hand to show it anywhere else: drawn where the store has it
			if (steering === null) bodies.delete(name);
		}
		if (landing !== null && [...landing.names].every((name) => !bodies.has(name) || !bodies.get(name)?.top)) {
			const done = landing.landed;
			landing = null;
			done();
		}
		tell();
		steering?.after(dt);
		ticking = false;
		if ((moving || bodies.size > 0 || hand !== null) && frame === 0) frame = requestAnimationFrame(tick);
	};

	const write = (places: ReadonlyMap<string, Point>) =>
		store.set((state) => ({
			frames: state.frames.map((one) => {
				const to = places.get(one.name);
				return to === undefined || (to.x === one.x && to.y === one.y) ? one : { ...one, x: to.x, y: to.y };
			}),
		}));

	return {
		drawn(name): DrawnFrame | undefined {
			const one = bodies.get(name);
			if (one === undefined) return undefined;
			const at = one.held ?? { x: one.x.x, y: one.y.x };
			return { x: at.x, y: at.y, scale: one.s.x, origin: one.origin, lift: Math.max(0, one.up.x), top: one.top };
		},
		listen(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		place(next, spring) {
			const { land } = tunes();
			const t = tunes()[spring];
			for (const [name, goal] of next) {
				const one = bodyOf(name);
				if (one === undefined || one.held !== null) continue;
				// a frame still landing keeps its landing; the rest make room
				const landing = (axis: Spring) => (axis.t === land && !axis.resting ? land : t);
				aim(one.x, goal.x, landing(one.x));
				aim(one.y, goal.y, landing(one.y));
			}
			wake();
		},
		hold(at, grab) {
			const { lift } = tunes();
			for (const [name, point] of at) {
				const one = bodyOf(name);
				if (one === undefined) continue;
				if (one.held === null) {
					one.origin = { x: grab.x - point.x, y: grab.y - point.y };
					one.top = true;
					aim(one.s, LIFTED, lift);
					aim(one.up, 1, lift);
				}
				one.held = point;
			}
			wake();
		},
		steer(next) {
			hand = next;
			if (next === null) springs = null;
			wake();
		},
		settle(next, velocity = { x: 0, y: 0 }, landed) {
			const { room, land } = tunes();
			const time = now();
			const from = new Set<string>();
			for (const [name, goal] of next) {
				goals.set(name, { at: goal, until: time + HOLD_MS });
				const one = bodyOf(name);
				if (one === undefined) continue;
				if (one.held !== null) {
					letGo(one, one.held, goal, velocity);
					from.add(name);
					continue;
				}
				const landing = (axis: Spring) => (axis.t === land && !axis.resting ? land : room);
				aim(one.x, goal.x, landing(one.x));
				aim(one.y, goal.y, landing(one.y));
			}
			// any frame left in the hand that has no place goes back to where it stands
			for (const [name, one] of bodies) {
				if (one.held === null) continue;
				letGo(one, one.held, standing(name) ?? one.held, velocity);
				from.add(name);
			}
			if (landed !== undefined) landing = { names: from, landed };
			write(next);
			wake();
		},
		stop() {
			if (frame !== 0) cancelAnimationFrame(frame);
			frame = 0;
			hand = null;
			landing = null;
			bodies.clear();
			goals.clear();
			tell();
		},
		keep(read) {
			if (goals.size === 0) return [...read];
			const time = now();
			const shown = new Map(store.get().frames.map((one) => [one.name, one]));
			return read.map((one) => {
				const goal = goals.get(one.name);
				if (goal === undefined) return one;
				const drawn = shown.get(one.name);
				const agreed = one.x === goal.at.x && one.y === goal.at.y;
				if (drawn === undefined || drawn.w !== one.w || drawn.h !== one.h || agreed || time > goal.until) {
					goals.delete(one.name);
					return one;
				}
				return { ...one, x: goal.at.x, y: goal.at.y };
			});
		},
	};
}
