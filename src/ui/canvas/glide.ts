import { useLayoutEffect, useRef, useState } from "react";
import type { Box } from "./camera";
import { springStep } from "./presence";

/**
 * A box that glides to where it is told rather than jumping there (DEV-301):
 * the selection's ring moving from one element to the next, the faint outline
 * moving under the pointer. It is the presence layer's motion, a critically
 * damped spring per edge, so it eases in, never overshoots, and a new goal
 * mid-flight just bends the path from wherever it stands.
 *
 * It glides in the units it is given (an element's frame-local box), never in
 * screen pixels, so whatever draws it asks the camera where that box falls
 * every frame and the camera moving under a glide moves it exactly.
 */
export interface Glide {
	/** Where the box is drawn now. */
	at(): Box;
	/** Glide to a box; the first one is where it starts. */
	to(goal: Box): void;
	/** Stand at a box at once. */
	jump(goal: Box): void;
	/** Hear every step, in the animation frame it is taken. Returns the unsubscribe. */
	listen(listener: () => void): () => void;
	stop(): void;
}

type Spring = { p: number; v: number };

/** The rate, in radians a second, at which a spring is within 1% of its goal `ms` after it set off. */
function rateFor(ms: number): number {
	// a critically damped spring is off by (1 + wt)e^(-wt) of its distance; that is 1% at wt = 6.64
	return 6.64 / (ms / 1000);
}

export function createGlide(ms: () => number): Glide {
	let springs: Spring[] | null = null;
	let goal: Box | null = null;
	let frame: number | undefined;
	let last = 0;
	// read once a flight, never a frame: the scale is a style, and reading one mid-frame can cost a recalc
	let rate = 0;
	const listeners = new Set<() => void>();
	const tell = () => {
		for (const listener of listeners) listener();
	};
	const settle = () => {
		if (goal === null) return;
		springs = [goal.x, goal.y, goal.w, goal.h].map((p) => ({ p, v: 0 }));
	};
	const step = (time: number) => {
		frame = undefined;
		if (springs === null || goal === null) return;
		// a frame that began before the flight was asked for still moves it, by a frame of the fastest screen
		const dt = Math.min(0.05, Math.max(1 / 120, (time - last) / 1000));
		last = time;
		const ends = [goal.x, goal.y, goal.w, goal.h];
		springs = springs.map((spring, i) => springStep(spring, ends[i] ?? 0, dt, rate));
		if (springs.every((spring, i) => Math.abs(spring.p - (ends[i] ?? 0)) < 0.1 && Math.abs(spring.v) < 2)) settle();
		else frame = requestAnimationFrame(step);
		tell();
	};
	return {
		at() {
			if (springs === null) return goal ?? { x: 0, y: 0, w: 0, h: 0 };
			const [x, y, w, h] = springs.map((spring) => spring.p);
			return { x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 };
		},
		to(next) {
			const was = goal;
			goal = next;
			const span = was === null || springs === null ? 0 : ms();
			if (span <= 0) {
				if (frame !== undefined) cancelAnimationFrame(frame);
				frame = undefined;
				settle();
				// a cut is a step too: whatever draws the box hears it, as it hears a jump
				tell();
				return;
			}
			if (was !== null && was.x === next.x && was.y === next.y && was.w === next.w && was.h === next.h) return;
			rate = rateFor(span);
			if (frame === undefined) {
				last = performance.now();
				frame = requestAnimationFrame(step);
			}
		},
		jump(next) {
			goal = next;
			if (frame !== undefined) cancelAnimationFrame(frame);
			frame = undefined;
			settle();
			tell();
		},
		listen(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		stop() {
			if (frame !== undefined) cancelAnimationFrame(frame);
			frame = undefined;
			settle();
		},
	};
}

/**
 * One of the motion scale's durations as the page has it (`--transition-duration-*`
 * in `theme.css`), so a glide moves on the same tokens as every transition and the
 * stillness that zeroes the scale stills it too. A page carrying no theme, as a
 * unit test's, has no scale and nothing glides.
 */
function themeDuration(name: "quick" | "fast" | "base"): number {
	if (typeof document === "undefined" || typeof getComputedStyle !== "function") return 0;
	const value = getComputedStyle(document.documentElement).getPropertyValue(`--transition-duration-${name}`).trim();
	if (value === "") return 0;
	const ms = Number.parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
	return Number.isFinite(ms) ? ms : 0;
}

/**
 * A glide for a box that may come and go: null keeps it where it last stood, and the
 * first box after it is a cut, not a flight from wherever the last one was.
 */
export function useGlide(goal: Box | null, duration: "quick" | "fast" | "base"): Glide {
	const [glide] = useState(() => createGlide(() => themeDuration(duration)));
	const shown = useRef(false);
	const x = goal?.x;
	const y = goal?.y;
	const w = goal?.w;
	const h = goal?.h;
	useLayoutEffect(() => {
		if (x === undefined || y === undefined || w === undefined || h === undefined) {
			shown.current = false;
			return;
		}
		if (shown.current) glide.to({ x, y, w, h });
		else glide.jump({ x, y, w, h });
		shown.current = true;
	}, [glide, x, y, w, h]);
	useLayoutEffect(() => () => glide.stop(), [glide]);
	return glide;
}
