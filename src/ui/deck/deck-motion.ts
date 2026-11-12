import { cubicBezier } from "motion/react";
import { useState } from "react";
import type { CanvasStore } from "../canvas/canvas-store";

/** A cubic Bézier's four numbers, as motion's `ease` takes them. */
export type Curve = readonly [number, number, number, number];

/**
 * The deck's motion as the page has it (spool#265): the theme's curves and scale, and the deck's own timings, its
 * prototype's numbers kept as `--motion-deck-*` in `theme.css`. Durations are in ms. A page that carries no theme, as
 * a unit test's, has none of them: nothing takes any time, on a straight line.
 */
export interface DeckMotion {
	readonly snap: Curve;
	readonly out: Curve;
	readonly base: number;
	readonly slow: number;
	readonly slower: number;
	/** frames settling into their slot or cell, on the snap curve */
	readonly settle: number;
	/** the outline of where a held frame lands, quicker than the frames, so it follows the hand */
	readonly glide: number;
	/** the camera going into a slide and back out, on the snap curve */
	readonly fly: number;
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
	/** the slides filling the screen (spool#298): the one spring every flight rides, by duration in seconds and bounce */
	readonly present: { readonly duration: number; readonly bounce: number };
	/** the black the slides stand on, coming in and going */
	readonly groundIn: number;
	readonly groundOut: number;
	/** the slide fading off its card once it has landed on it, and onto the picture it flew as */
	readonly handOver: number;
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
	const [stiffness = 0, damping = 0, mass = 1] = numbers("--motion-deck-pointer");
	const [duration = 0, bounce = 0] = numbers("--motion-deck-present");
	return {
		snap: curve("--ease-snap"),
		out: curve("--ease-out"),
		base: ms("--transition-duration-base"),
		slow: ms("--transition-duration-slow"),
		slower: ms("--transition-duration-slower"),
		settle: ms("--motion-deck-settle"),
		glide: ms("--motion-deck-glide"),
		fly: ms("--motion-deck-fly"),
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
		present: { duration, bounce },
		groundIn: ms("--motion-deck-ground-in"),
		groundOut: ms("--motion-deck-ground-out"),
		handOver: ms("--motion-deck-hand-over"),
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

/** Frames gliding to their places on the canvas, by path; a new goal mid-flight sets off from where they stand. */
export interface FrameTween {
	/**
	 * Every frame named to its goal: one already flying there keeps its flight, one flying elsewhere turns from where
	 * it stands, and a frame not named stops where it is. `holdFor` is how long `keep` holds a goal that no read has
	 * agreed with: a drop's places are the daemon's to write, a drag's preview never is.
	 */
	to(goals: ReadonlyMap<string, Point>, holdFor?: number): void;
	stop(): void;
	/**
	 * Frames as a read of the disk has them, with the ones this tween has a goal for where it has them: a read that
	 * lands mid-flight, or before the daemon has written the goal, never moves a frame back. A frame lets go once a
	 * read has it at its goal, or has it at another size, which no goal of the old size can speak for.
	 */
	keep<F extends Frame>(read: readonly F[]): F[];
}

interface Frame extends Point {
	readonly name: string;
	readonly w: number;
	readonly h: number;
}

/** A goal no read has agreed with in this long is let go, so a write the daemon never made cannot hold a frame. */
export const HOLD_MS = 4000;

const stillness = () =>
	typeof window !== "undefined" &&
	typeof window.matchMedia === "function" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Flight {
	readonly from: Point;
	readonly to: Point;
	readonly start: number;
}

/**
 * Moves the canvas's own frames, as a drag does: their places in the canvas's store change a drawn frame at a time,
 * and nothing is written. The daemon writes the places a deck change settles on, and they arrive as the same numbers;
 * until they do, `keep` holds each frame where the glide has it. They settle on the deck's own timing, on the snap
 * curve.
 */
export function createFrameTween(store: CanvasStore, still = stillness, now = () => performance.now()): FrameTween {
	const flights = new Map<string, Flight>();
	/** each frame's goal, and when it was set */
	const goals = new Map<string, { at: Point; until: number }>();
	let frame = 0;
	let motion = { ms: 0, ease: (t: number) => t };
	const write = (at: (name: string) => Point | undefined) =>
		store.set((state) => ({
			frames: state.frames.map((one) => {
				const to = at(one.name);
				return to === undefined || (to.x === one.x && to.y === one.y) ? one : { ...one, x: to.x, y: to.y };
			}),
		}));
	const step = (time: number) => {
		frame = 0;
		write((name) => {
			const flight = flights.get(name);
			if (flight === undefined) return undefined;
			const t = Math.min(1, Math.max(0, (time - flight.start) / motion.ms));
			const k = motion.ease(t);
			if (t >= 1) flights.delete(name);
			return {
				x: flight.from.x + (flight.to.x - flight.from.x) * k,
				y: flight.from.y + (flight.to.y - flight.from.y) * k,
			};
		});
		if (flights.size > 0) frame = requestAnimationFrame(step);
	};
	const stop = () => {
		if (frame !== 0) cancelAnimationFrame(frame);
		frame = 0;
		flights.clear();
		goals.clear();
	};
	const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
	return {
		to(next, holdFor = HOLD_MS) {
			const time = now();
			for (const name of [...flights.keys()]) if (!next.has(name)) flights.delete(name);
			for (const name of [...goals.keys()]) if (!next.has(name)) goals.delete(name);
			const { settle, snap } = deckMotion();
			motion = { ms: settle, ease: easing(snap) };
			const instant = still() || settle <= 0;
			const jumps = new Map<string, Point>();
			for (const one of store.get().frames) {
				const goal = next.get(one.name);
				if (goal === undefined) continue;
				goals.set(one.name, { at: goal, until: time + holdFor });
				const flight = flights.get(one.name);
				if (flight !== undefined && same(flight.to, goal)) continue;
				flights.delete(one.name);
				if (same(one, goal)) continue;
				if (instant) jumps.set(one.name, goal);
				else flights.set(one.name, { from: { x: one.x, y: one.y }, to: goal, start: time });
			}
			if (jumps.size > 0) write((name) => jumps.get(name));
			if (flights.size > 0 && frame === 0) frame = requestAnimationFrame(step);
			if (flights.size === 0 && frame !== 0) {
				cancelAnimationFrame(frame);
				frame = 0;
			}
		},
		stop,
		keep(read) {
			if (goals.size === 0) return [...read];
			const time = now();
			const shown = new Map(store.get().frames.map((one) => [one.name, one]));
			return read.map((one) => {
				const goal = goals.get(one.name);
				if (goal === undefined) return one;
				const drawn = shown.get(one.name);
				const flying = flights.has(one.name);
				const letGo =
					drawn === undefined ||
					drawn.w !== one.w ||
					drawn.h !== one.h ||
					(!flying && (same(one, goal.at) || time > goal.until));
				if (letGo) {
					goals.delete(one.name);
					flights.delete(one.name);
					return one;
				}
				const at = flying ? drawn : goal.at;
				return same(one, at) ? one : { ...one, x: at.x, y: at.y };
			});
		},
	};
}
