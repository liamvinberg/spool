import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import type { FrameState, SweepInput } from "./lifecycle";
import { sweepLifecycle } from "./lifecycle";

/**
 * The lifecycle decision function (#40, #112): fabricated frames in, per-sweep
 * states out, with no browser and no real timers. Mounting is caused: you went
 * to a frame, or it is readable on the resting canvas. The named camera and
 * viewport make the last cause plain. A picture is never a cause: the daemon's
 * photo booth makes every one, so the canvas has nothing to borrow a frame for.
 */

const frame = (name: string, x: number, y: number, covered = true): ProjectedFrame => ({
	name,
	x,
	y,
	w: 100,
	h: 100,
	...(covered ? { cover: { hash: "0".repeat(32) } } : {}),
});

/** Threads states through consecutive sweeps, the way the hook does. */
function sweeper() {
	let states: Record<string, FrameState> = {};
	const sweep = (frames: ProjectedFrame[], input: Partial<Omit<SweepInput, "frames">> = {}) => {
		const result = sweepLifecycle({
			frames,
			entered: null,
			selectionTargets: new Set(),
			held: null,
			states,
			camera: { x: 0, y: 0, k: 1 },
			viewport: { width: 1000, height: 1000 },
			...input,
		});
		states = result.states;
		return result;
	};
	return { sweep, states: () => states };
}

const mounted = (states: Record<string, FrameState>): string[] =>
	Object.entries(states)
		.filter(([, state]) => state !== "picture")
		.map(([name]) => name)
		.sort();

describe("being on screen is not a cause", () => {
	it("mounts nothing for a screenful of covered frames, however long it sits there", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450), frame("c", 450, 300)];
		const s = sweeper();
		for (let i = 0; i < 20; i++) {
			expect(mounted(s.sweep(frames).states)).toEqual([]);
		}
	});

	it("mounts nothing for thirty covered frames, wherever they sit", () => {
		const frames = Array.from({ length: 30 }, (_, i) => frame(`f${i}`, i * 120, i * 7));
		const s = sweeper();
		for (let sweeps = 0; sweeps < 30; sweeps++) {
			expect(mounted(s.sweep(frames).states)).toEqual([]);
		}
	});
});

describe("a picture is never a cause", () => {
	it("mounts nothing for frames with no picture at all, however long they wait for one", () => {
		// the placeholder stands until the daemon's photo booth lands a cover
		const frames = Array.from({ length: 30 }, (_, i) => frame(`f${i}`, i * 120, 0, false));
		const s = sweeper();
		for (let sweeps = 0; sweeps < 30; sweeps++) {
			expect(mounted(s.sweep(frames).states)).toEqual([]);
		}
	});

	it("hands a frame you left straight back to its picture", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames, { entered: "a" });
		// what it showed while you were inside is not what its cover is of, and the
		// cover is the frame's first screen: nothing is borrowed to photograph it
		expect(s.sweep(frames).states).toEqual({ a: "picture" });
	});

	it("lets go of a selection released below the readable size", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();
		s.sweep(frames, { selectionTargets: new Set(["a"]) });
		expect(s.sweep(frames).states).toEqual({ a: "picture" });
	});
});

describe("you went to it", () => {
	it("mounts the entered frame in its own sweep, and keeps it live wherever the camera goes", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { entered: "a" }).states).toEqual({ a: "live", b: "picture" });
		expect(s.sweep(frames, { entered: "a", camera: { x: -900_000, y: 0, k: 1 } }).states.a).toBe("live");
	});
});

describe("intent", () => {
	it("shows every selected frame live below the readable threshold", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450), frame("c", 750, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { selectionTargets: new Set(["a", "b", "c"]) }).states).toEqual({
			a: "live",
			b: "live",
			c: "live",
		});
	});

	it("keeps every readable HTML pick live", () => {
		const frames = [frame("a", 0, 0), frame("b", 100, 0), frame("c", 200, 0)];
		const s = sweeper();

		expect(
			s.sweep(frames, {
				selectionTargets: new Set(["a", "b", "c"]),
				camera: { x: 0, y: 0, k: 4 },
				viewport: { width: 1000, height: 1000 },
			}).states,
		).toEqual({ a: "live", b: "live", c: "live" });
	});

	it("releases only picks no longer represented, then releases the whole selection", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450), frame("c", 750, 450)];
		const s = sweeper();
		s.sweep(frames, { selectionTargets: new Set(["a", "b", "c"]) });

		expect(s.sweep(frames, { selectionTargets: new Set(["a", "c"]) }).states).toEqual({
			a: "live",
			b: "picture",
			c: "live",
		});
		expect(s.sweep(frames, { selectionTargets: new Set() }).states).toEqual({
			a: "picture",
			b: "picture",
			c: "picture",
		});
	});

	it("unites picked-frame intent with the frame an export holds", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450), frame("export", 750, 450)];
		const s = sweeper();

		expect(
			s.sweep(frames, {
				selectionTargets: new Set(["a", "b"]),
				held: "export",
			}).states,
		).toEqual({ a: "live", b: "live", export: "held" });
	});

	it("leaves a readable selection live while Select owns it and an export holds it", () => {
		const frames = [frame("a", 0, 0), frame("b", 200, 0)];
		const s = sweeper();

		expect(
			s.sweep(frames, {
				selectionTargets: new Set(["a"]),
				held: "a",
				camera: { x: 0, y: 0, k: 4 },
				viewport: { width: 1000, height: 1000 },
			}).states,
		).toEqual({ a: "live", b: "live" });
	});

	it("shows an unreadable selection live", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { selectionTargets: new Set(["a"]) }).states).toEqual({ a: "live", b: "picture" });
		expect(s.sweep(frames, { selectionTargets: new Set(["b"]) }).states).toEqual({ a: "picture", b: "live" });
	});

	it("holds a frame being read rather than looked at, wherever the camera is", () => {
		const frames = [frame("a", 450, 450), frame("far", -900_000, 0)];
		const s = sweeper();

		expect(s.sweep(frames, { held: "far" }).states.far).toBe("held");
	});

	it("keeps an unreadable entered selection live", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { entered: "a", selectionTargets: new Set(["a"]) }).states).toEqual({ a: "live" });
		expect(s.sweep(frames, { entered: "a" }).states).toEqual({ a: "live" });
	});
});

describe("what a sweep reports", () => {
	it("says nothing changed when every frame stays where it was", () => {
		const frames = [frame("a", 0, 0), frame("b", 200, 0)];
		const s = sweeper();
		expect(s.sweep(frames).changed).toBe(true);
		expect(s.sweep(frames).changed).toBe(false);
	});

	it("says something changed when a frame arrives or leaves, though every state stands", () => {
		const s = sweeper();
		s.sweep([frame("a", 0, 0)]);
		expect(s.sweep([frame("a", 0, 0), frame("b", 200, 0)]).changed).toBe(true);
		expect(s.sweep([frame("a", 0, 0)]).changed).toBe(true);
		expect(s.states()).toEqual({ a: "picture" });
	});
});

describe("a readable frame", () => {
	const view = { width: 1000, height: 1000 };
	const at = (k: number) => ({ camera: { x: 0, y: 0, k }, viewport: view });

	it("runs a frame drawn big enough and inside the ring", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();

		expect(s.sweep(frames, at(4)).states).toEqual({ a: "live" });
	});

	it("leaves a frame drawn too small to read as its picture", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();

		// 100px wide at k = 1: legible as a still, not worth a document
		expect(s.sweep(frames, at(1)).states).toEqual({ a: "picture" });
	});

	/** a phone: 390 across, 844 down, and the shape most frames are (#223) */
	const portrait = (name: string): ProjectedFrame => ({ ...frame(name, 0, 0), w: 390, h: 844 });

	it("runs a portrait frame drawn big enough down, though it is narrow across", () => {
		const s = sweeper();

		// 390 across at 100% never reached a gate keyed on width, so a phone was a
		// photograph at the zoom you read one at
		expect(s.sweep([portrait("a")], at(1)).states).toEqual({ a: "live" });
	});

	it("leaves a portrait frame whose longer edge is too small as its picture", () => {
		const s = sweeper();

		// 844 * 0.4 is 338: neither edge is drawn big enough to be worth a document
		expect(s.sweep([portrait("a")], at(0.4)).states).toEqual({ a: "picture" });
	});

	it("keys a landscape frame on the edge it always did", () => {
		const wide = (name: string): ProjectedFrame => ({ ...frame(name, 0, 0), w: 800, h: 200 });
		const s = sweeper();

		expect(s.sweep([wide("a")], at(0.4)).states).toEqual({ a: "picture" });
		expect(s.sweep([wide("a")], at(0.5)).states).toEqual({ a: "live" });
	});

	it("leaves a frame far outside the viewport as its picture, however big it draws", () => {
		const frames = [frame("near", 0, 0), frame("far", 100_000, 0)];
		const s = sweeper();

		expect(s.sweep(frames, at(4)).states).toEqual({ near: "live", far: "picture" });
	});

	it("keeps a frame in the viewport's 25% ring live", () => {
		const frames = [frame("ring", 300, 0)];
		const s = sweeper();

		expect(s.sweep(frames, at(4)).states).toEqual({ ring: "live" });
	});

	it("bounds natural live frames by the viewport and adds only explicit selection", () => {
		// two hundred frames in a row: the ring admits a fixed span of world,
		// and the page's own size never enters the arithmetic
		const many = Array.from({ length: 200 }, (_, index) => frame(`f${index}`, index * 150, 0));
		const s = sweeper();
		const view = at(4);
		const natural = mounted(s.sweep(many, view).states);

		expect(natural.length).toBeGreaterThan(0);
		expect(natural.length).toBeLessThan(30);
		const additions = ["f50", "f100", "f199"];
		const withSelection = mounted(s.sweep(many, { ...view, selectionTargets: new Set(additions) }).states);

		expect(withSelection).toEqual([...natural, ...additions].sort());
	});

	it("leaves a frame below the threshold its placeholder when its picture is missing", () => {
		const frames = [frame("a", 0, 0, false)];
		const s = sweeper();

		expect(s.sweep(frames, at(1)).states).toEqual({ a: "picture" });
	});

	it("keeps a selection live through zooming out and hands it back on release", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();
		s.sweep(frames, at(4));
		s.sweep(frames, { selectionTargets: new Set(["a"]), ...at(4) });

		expect(s.sweep(frames, { selectionTargets: new Set(["a"]), ...at(1) }).states.a).toBe("live");
		expect(s.sweep(frames, at(1)).states.a).toBe("picture");
	});
});
