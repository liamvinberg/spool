// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { ProjectedFrame } from "../api";
import { createCanvasStore } from "../canvas/canvas-store";
import { createFrameSprings, type DeckMotion, deckMotion, HOLD_MS, LIFTED } from "./deck-motion";
import { tune } from "./spring";

/** The roles the theme gives a page, before stillness takes the scale to zero. */
const THEME =
	readFileSync(join(import.meta.dirname, "..", "theme.css"), "utf8").split("@media (prefers-reduced-motion")[0] ?? "";

it("moves the deck on the theme's roles, its prototype's timings and springs kept as approved", () => {
	const page = document.body.appendChild(document.createElement("div"));
	for (const [, name = "", value = ""] of THEME.matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm))
		page.style.setProperty(name, value);
	expect(deckMotion(page)).toEqual({
		snap: [0.32, 0.72, 0, 1],
		out: [0.22, 0.61, 0.36, 1],
		base: 180,
		slow: 260,
		slower: 400,
		room: tune(0.3, 0),
		rush: tune(0.16, 0),
		land: tune(0.36, 0.12),
		lift: tune(0.24, 0),
		fly: 600,
		reveal: 500,
		leaveWait: 120,
		leave: 660,
		return: 560,
		chromeWait: 200,
		arrive: { head: 100, side: 180, foot: 240 },
		notes: 300,
		present: { duration: 0.5, bounce: 0 },
		groundIn: 340,
		groundOut: 300,
		handOver: 160,
	});
});

describe("a deck page's frames on springs", () => {
	/** two frames on a page, drawn frames run by hand at 60 a second, on the deck's springs */
	const setup = (still = false) => {
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
		const timing = {
			room: tune(0.3),
			rush: tune(0.16),
			land: tune(0.36, 0.12),
			lift: tune(0.24),
		} as DeckMotion;
		const springs = createFrameSprings(
			store,
			() => 1,
			() => still,
			() => time,
			() => timing,
		);
		let told = 0;
		springs.listen(() => {
			told += 1;
		});
		/** run drawn frames until `to` ms */
		const run = (to: number) => {
			while (time < to) {
				time = Math.min(to, time + 1000 / 60);
				const now = queued;
				queued = [];
				for (const callback of now) callback(time);
			}
		};
		const at = (name: string) => store.get().frames.find((one) => one.name === name);
		return { store, springs, run, at, told: () => told, queued: () => queued.length };
	};
	const frame = (name: string, x: number, y: number, w = 1280) =>
		({ name, x, y, w, h: 720 }) as unknown as ProjectedFrame;

	it("makes room from where a frame is drawn, and turns it round mid-flight at the speed it has", () => {
		const { springs, run, at } = setup();
		springs.steer({ frame: () => {}, after: () => {} });
		springs.place(new Map([["p", { x: 1000, y: 0 }]]), "room");
		run(100);
		const out = springs.drawn("p")?.x ?? 0;
		expect(out).toBeGreaterThan(100);
		expect(out).toBeLessThan(900);
		// a preview is drawn, never stood in
		expect(at("p")?.x).toBe(0);
		springs.place(new Map([["p", { x: 0, y: 0 }]]), "room");
		const track: number[] = [];
		for (let t = 100; t < 1000; t += 1000 / 60) {
			run(t);
			track.push(springs.drawn("p")?.x ?? Number.NaN);
		}
		// it carried on a little the way it was going, never jumping, and came back to rest
		expect(Math.abs((track[0] ?? 0) - out)).toBeLessThan(60);
		expect(Math.max(...track)).toBeGreaterThan(out);
		expect(track.at(-1)).toBe(0);
	});

	it("asks for one animation frame at a time while the hand moves its frames each frame", () => {
		const { springs, run, queued } = setup();
		let x = 0;
		springs.steer({
			frame: () => {
				x += 10;
				springs.hold(new Map([["p", { x, y: 0 }]]), { x: 100, y: 50 });
				springs.place(new Map([["q", { x, y: 1000 }]]), "room");
			},
			after: () => {},
		});
		for (let t = 0; t < 500; t += 1000 / 60) {
			run(t);
			expect(queued()).toBe(1);
		}
		expect(springs.drawn("p")?.x).toBe(x);
	});

	it("lifts a frame in the hand, lands it at the hand's speed over the rest, and then draws it where it stands", () => {
		const { springs, run, at } = setup();
		const landed = vi.fn();
		springs.steer({ frame: () => {}, after: () => {} });
		springs.hold(new Map([["p", { x: 200, y: 50 }]]), { x: 300, y: 100 });
		run(400);
		expect(springs.drawn("p")).toEqual({
			x: 200,
			y: 50,
			scale: LIFTED,
			origin: { x: 100, y: 50 },
			lift: 1,
			top: true,
		});
		springs.steer(null);
		springs.settle(
			new Map([
				["p", { x: 1440, y: 0 }],
				["q", { x: 0, y: 1000 }],
			]),
			{ x: 3000, y: 0 },
			landed,
		);
		// the store has it at its place at once, and it is drawn from where the hand left it, over the rest
		expect(at("p")?.x).toBe(1440);
		expect(springs.drawn("p")?.x).toBe(200);
		run(416);
		expect(springs.drawn("p")?.top).toBe(true);
		const track: number[] = [];
		for (let t = 416; t < 2000; t += 1000 / 60) {
			run(t);
			track.push(springs.drawn("p")?.x ?? 1440);
		}
		// past its place by a little bounce, once, and then at rest there: drawn where the store has it
		expect(Math.max(...track)).toBeGreaterThan(1440);
		expect(Math.max(...track)).toBeLessThan(1440 + 200);
		expect(springs.drawn("p")).toBeUndefined();
		expect(landed).toHaveBeenCalledOnce();
	});

	it("holds a frame settled over any read until a read has it at its place", () => {
		const { springs, run, at } = setup();
		springs.settle(new Map([["p", { x: 1000, y: 0 }]]));
		run(100);
		// the disk before the daemon wrote the place, landing mid-flight: the place stands
		expect(springs.keep([frame("p", 0, 0)])[0]?.x).toBe(1000);
		run(2000);
		expect(at("p")?.x).toBe(1000);
		expect(springs.keep([frame("p", 0, 0)])[0]?.x).toBe(1000);
		// once a read agrees the frame is the reads' again
		expect(springs.keep([frame("p", 1000, 0)])[0]?.x).toBe(1000);
		expect(springs.keep([frame("p", 0, 0)])[0]?.x).toBe(0);
	});

	it("lets go of a frame a read has at another size, and of one held longer than a write takes", () => {
		const { springs, run } = setup();
		springs.settle(new Map([["p", { x: 1000, y: 0 }]]));
		expect(springs.keep([frame("p", 0, 0, 1920)])[0]?.x).toBe(0);
		springs.settle(new Map([["q", { x: 1000, y: 1000 }]]));
		run(HOLD_MS + 1);
		expect(springs.keep([frame("q", 0, 1000)])[0]?.x).toBe(0);
	});

	it("sets every frame where it goes at once under reduced motion", () => {
		const { springs, at } = setup(true);
		springs.steer({ frame: () => {}, after: () => {} });
		springs.hold(new Map([["p", { x: 200, y: 50 }]]), { x: 300, y: 100 });
		expect(springs.drawn("p")?.scale).toBe(LIFTED);
		springs.place(new Map([["q", { x: 500, y: 1000 }]]), "room");
		expect(springs.drawn("q")?.x).toBe(500);
		springs.steer(null);
		springs.settle(new Map([["p", { x: 1440, y: 0 }]]));
		expect(springs.drawn("p")).toMatchObject({ x: 1440, scale: 1, lift: 0 });
		expect(at("p")?.x).toBe(1440);
	});
});
