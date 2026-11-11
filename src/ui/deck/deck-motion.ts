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
	to(goals: ReadonlyMap<string, Point>): void;
	stop(): void;
}

const stillness = () =>
	typeof window !== "undefined" &&
	typeof window.matchMedia === "function" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Moves the canvas's own frames, as a drag does: their places in the canvas's store change a drawn frame at a time,
 * and nothing is written. The daemon writes the places a deck change settles on, and they arrive as the same numbers.
 * They settle on the deck's own timing, on the snap curve.
 */
export function createFrameTween(store: CanvasStore, still = stillness): FrameTween {
	let flight: {
		from: Map<string, Point>;
		to: Map<string, Point>;
		start: number;
		ms: number;
		ease: (t: number) => number;
	} | null = null;
	let frame = 0;
	const write = (at: (name: string) => Point | undefined) =>
		store.set((state) => ({
			frames: state.frames.map((one) => {
				const to = at(one.name);
				return to === undefined || (to.x === one.x && to.y === one.y) ? one : { ...one, x: to.x, y: to.y };
			}),
		}));
	const step = (now: number) => {
		frame = 0;
		const going = flight;
		if (going === null) return;
		const t = Math.min(1, Math.max(0, (now - going.start) / going.ms));
		const k = going.ease(t);
		write((name) => {
			const from = going.from.get(name);
			const to = going.to.get(name);
			return from === undefined || to === undefined
				? undefined
				: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
		});
		if (t < 1) frame = requestAnimationFrame(step);
		else flight = null;
	};
	const stop = () => {
		if (frame !== 0) cancelAnimationFrame(frame);
		frame = 0;
		flight = null;
	};
	return {
		to(goals) {
			stop();
			const from = new Map<string, Point>();
			const to = new Map<string, Point>();
			for (const one of store.get().frames) {
				const goal = goals.get(one.name);
				if (goal === undefined || (goal.x === one.x && goal.y === one.y)) continue;
				from.set(one.name, { x: one.x, y: one.y });
				to.set(one.name, goal);
			}
			if (to.size === 0) return;
			const { settle, snap } = deckMotion();
			if (still() || settle <= 0) {
				write((name) => to.get(name));
				return;
			}
			flight = { from, to, start: performance.now(), ms: settle, ease: easing(snap) };
			frame = requestAnimationFrame(step);
		},
		stop,
	};
}
