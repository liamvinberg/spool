import { cubicBezier } from "motion/react";
import type { CanvasStore } from "../canvas/canvas-store";

/**
 * The deck page's motion, the prototype's numbers (`field.tsx`): frames settle into their slot or cell on the snap
 * curve in 440 ms, and the outline of where a held frame lands glides there in 220 ms, quicker than the frames, so it
 * follows the hand.
 */
export const SNAP = cubicBezier(0.32, 0.72, 0, 1);
export const SETTLE_MS = 440;
export const GLIDE_MS = 220;

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
 */
export function createFrameTween(store: CanvasStore, ms = SETTLE_MS, still = stillness): FrameTween {
	let flight: { from: Map<string, Point>; to: Map<string, Point>; start: number } | null = null;
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
		const t = Math.min(1, Math.max(0, (now - going.start) / ms));
		const k = SNAP(t);
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
			if (still() || ms <= 0) {
				write((name) => to.get(name));
				return;
			}
			flight = { from, to, start: performance.now() };
			frame = requestAnimationFrame(step);
		},
		stop,
	};
}
