// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { ProjectedFrame } from "../api";
import { createCanvasStore } from "../canvas/canvas-store";
import { createFrameTween, deckMotion, HOLD_MS } from "./deck-motion";

/** The roles the theme gives a page, before stillness takes the scale to zero. */
const THEME =
	readFileSync(join(import.meta.dirname, "..", "theme.css"), "utf8").split("@media (prefers-reduced-motion")[0] ?? "";

it("moves the deck on the theme's roles, its prototype's timings kept as approved", () => {
	const page = document.body.appendChild(document.createElement("div"));
	for (const [, name = "", value = ""] of THEME.matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm))
		page.style.setProperty(name, value);
	expect(deckMotion(page)).toEqual({
		snap: [0.32, 0.72, 0, 1],
		out: [0.22, 0.61, 0.36, 1],
		base: 180,
		slow: 260,
		slower: 400,
		settle: 440,
		glide: 220,
		fly: 600,
		leaveWait: 120,
		leave: 660,
		return: 560,
		chromeWait: 200,
		arrive: { head: 100, side: 180, foot: 240 },
		notes: 300,
		pointer: { stiffness: 900, damping: 60, mass: 0.4 },
	});
});

describe("frames gliding to a deck's places", () => {
	/** a page with the deck's settle timing on a straight line, drawn frames run by hand */
	const setup = () => {
		const root = document.documentElement;
		root.style.setProperty("--motion-deck-settle", "400ms");
		root.style.setProperty("--ease-snap", "cubic-bezier(0, 0, 1, 1)");
		onTestFinished(() => root.removeAttribute("style"));
		let queued: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queued.push(callback));
		vi.stubGlobal("cancelAnimationFrame", () => {
			queued = [];
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});
		let time = 0;
		const store = createCanvasStore();
		store.set({ frames: [frame("p", 0, 0), frame("q", 0, 1000)] });
		const tween = createFrameTween(
			store,
			() => false,
			() => time,
		);
		const run = (to: number) => {
			time = to;
			const now = queued;
			queued = [];
			for (const callback of now) callback(to);
		};
		const at = (name: string) => store.get().frames.find((one) => one.name === name);
		return { store, tween, run, at, setTime: (to: number) => (time = to) };
	};
	const frame = (name: string, x: number, y: number, w = 1280) =>
		({ name, x, y, w, h: 720 }) as unknown as ProjectedFrame;

	it("holds a frame where its glide has it over any read until a read has it at its goal", () => {
		const { tween, run, at } = setup();
		tween.to(new Map([["p", { x: 1000, y: 0 }]]));
		run(200);
		expect(at("p")?.x).toBe(500);
		// the daemon's places, or the disk before it wrote them, landing mid-flight: the glide stands
		expect(tween.keep([frame("p", 1000, 0)])[0]?.x).toBe(500);
		expect(tween.keep([frame("p", 0, 0)])[0]?.x).toBe(500);
		run(400);
		expect(at("p")?.x).toBe(1000);
		// landed, a read from before the write still cannot take it back
		expect(tween.keep([frame("p", 0, 0)])[0]?.x).toBe(1000);
		// once a read agrees the frame is the reads' again
		expect(tween.keep([frame("p", 1000, 0)])[0]?.x).toBe(1000);
		expect(tween.keep([frame("p", 0, 0)])[0]?.x).toBe(0);
	});

	it("lets go of a frame a read has at another size, and of one held longer than a write takes", () => {
		const { tween, run, at, setTime } = setup();
		tween.to(new Map([["p", { x: 1000, y: 0 }]]));
		run(200);
		expect(tween.keep([frame("p", 0, 0, 1920)])[0]?.x).toBe(0);
		run(300);
		expect(at("p")?.x).toBe(500);
		tween.to(new Map([["q", { x: 1000, y: 1000 }]]));
		run(800);
		setTime(800 + HOLD_MS + 1);
		expect(tween.keep([frame("q", 0, 1000)])[0]?.x).toBe(0);
	});

	it("keeps a glide whose goal stands, and turns one whose goal moved from where it is", () => {
		const { tween, run, at } = setup();
		tween.to(
			new Map([
				["p", { x: 1000, y: 0 }],
				["q", { x: 1000, y: 1000 }],
			]),
		);
		run(200);
		tween.to(
			new Map([
				["p", { x: 1000, y: 0 }],
				["q", { x: 0, y: 1000 }],
			]),
		);
		run(400);
		// p landed on its first timing; q set off back from halfway
		expect(at("p")?.x).toBe(1000);
		expect(at("q")?.x).toBe(250);
		run(600);
		expect(at("q")?.x).toBe(0);
	});
});
