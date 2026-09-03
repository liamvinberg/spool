import { describe, expect, it } from "vitest";
import type { FlowEdge, ProjectedFrame } from "../api";
import { ARRANGE_DEFAULTS, arrange, packRank } from "./arrange";

/**
 * Tidy: a layered drawing of the navigation graph. Ranks read the flow, the
 * ordering sweeps cut crossings, and the whole result lands on the corner the
 * frames already occupied — tidy rearranges, it never travels.
 */

const frame = (name: string, x = 0, y = 0, w = 1440, h = 900): ProjectedFrame => ({
	name,
	x,
	y,
	w,
	h,
});

const edge = (from: string, to: string): FlowEdge => ({ from, to, certainty: "will", sites: [] });

/** Where a laid-out frame's top-left landed. */
const at = (rects: Record<string, { x: number; y: number }>, name: string) => {
	const rect = rects[name];
	if (rect === undefined) throw new Error(`${name} was not placed`);
	return rect;
};

describe("arrange", () => {
	it("ranks a chain top to bottom, one rank per hop", () => {
		const rects = arrange([frame("a"), frame("b"), frame("c")], [edge("a", "b"), edge("b", "c")]);
		expect(at(rects, "a").y).toBeLessThan(at(rects, "b").y);
		expect(at(rects, "b").y).toBeLessThan(at(rects, "c").y);
		// a straight chain stays straight: every frame on one centre line
		expect(at(rects, "a").x).toBe(at(rects, "b").x);
		expect(at(rects, "b").x).toBe(at(rects, "c").x);
	});

	it("puts siblings side by side on one rank, a gutter apart", () => {
		const rects = arrange([frame("home"), frame("one"), frame("two")], [edge("home", "one"), edge("home", "two")]);
		expect(at(rects, "one").y).toBe(at(rects, "two").y);
		const gap = Math.abs(at(rects, "one").x - at(rects, "two").x) - 1440;
		expect(gap).toBe(ARRANGE_DEFAULTS.gapX);
	});

	it("centres a hub over the frames it reaches", () => {
		const rects = arrange([frame("home"), frame("one"), frame("two")], [edge("home", "one"), edge("home", "two")]);
		const children = [at(rects, "one").x + 720, at(rects, "two").x + 720];
		expect(at(rects, "home").x + 720).toBeCloseTo((Math.min(...children) + Math.max(...children)) / 2, 5);
	});

	it("reads a cycle as a flow — a walk home never sinks the entry frame", () => {
		// a pure two-way loop carries no direction of its own: the canvas the
		// hands already arranged breaks the tie, and home was on top
		const rects = arrange(
			[frame("home", 0, 0), frame("detail", 0, 2000)],
			[edge("home", "detail"), edge("detail", "home")],
		);
		expect(at(rects, "home").y).toBeLessThan(at(rects, "detail").y);
	});

	it("keeps a hub that everything returns to at the top", () => {
		// the shape on Spool's own canvas: one home, many screens, every one of
		// them walking back. The returns must not rank home below its children.
		const frames = [frame("home"), ...["a", "b", "c", "d"].map((name) => frame(name))];
		const edges = ["a", "b", "c", "d"].flatMap((name) => [edge("home", name), edge(name, "home")]);
		const rects = arrange(frames, edges);
		for (const name of ["a", "b", "c", "d"]) {
			expect(at(rects, "home").y).toBeLessThan(at(rects, name).y);
		}
	});

	it("ignores self walks and destinations no frame answers to", () => {
		const rects = arrange(
			[frame("a"), frame("b")],
			[edge("a", "a"), { ...edge("a", "gone"), missing: true }, edge("a", "b")],
		);
		expect(at(rects, "a").y).toBeLessThan(at(rects, "b").y);
		expect(Object.keys(rects)).toEqual(["a", "b"]);
	});

	it("sets an unconnected frame clear of the flow, never inside it", () => {
		const rects = arrange([frame("a"), frame("b"), frame("loose")], [edge("a", "b")]);
		const loose = at(rects, "loose");
		for (const name of ["a", "b"]) {
			const linked = at(rects, name);
			const apart =
				Math.abs(loose.x - linked.x) >= 1440 + ARRANGE_DEFAULTS.gapGroup ||
				Math.abs(loose.y - linked.y) >= 900 + ARRANGE_DEFAULTS.gapGroup;
			expect(apart).toBe(true);
		}
	});

	it("packs frames nothing links into a block, never one endless strip", () => {
		// a page of explorations: no threads at all, so every frame is its own
		// group. A row of twelve would be worse to read than the field it replaced.
		const frames = Array.from({ length: 12 }, (_, i) => frame(`x${i}`));
		const rects = arrange(frames, []);
		const placed = Object.values(rects);
		const width = Math.max(...placed.map((rect) => rect.x + rect.w)) - Math.min(...placed.map((rect) => rect.x));
		const height = Math.max(...placed.map((rect) => rect.y + rect.h)) - Math.min(...placed.map((rect) => rect.y));
		expect(width).toBeLessThan(12 * 1440);
		expect(height).toBeGreaterThan(900); // it wrapped
		expect(width / height).toBeLessThan(4);
	});

	it("keeps every size and moves only places", () => {
		const frames = [frame("a", 10, 20, 400, 300), frame("b", -900, 4000, 1440, 900)];
		const rects = arrange(frames, [edge("a", "b")]);
		expect(at(rects, "a")).toMatchObject({ w: 400, h: 300 });
		expect(at(rects, "b")).toMatchObject({ w: 1440, h: 900 });
	});

	it("lands on the corner the frames already occupied", () => {
		const frames = [frame("a", 300, 700), frame("b", 5000, 700), frame("c", 300, 3000)];
		const rects = arrange(frames, [edge("a", "b"), edge("b", "c")]);
		const placed = Object.values(rects);
		expect(Math.min(...placed.map((rect) => rect.x))).toBe(300);
		expect(Math.min(...placed.map((rect) => rect.y))).toBe(700);
	});

	it("answers the same way twice, whatever order the frames arrive in", () => {
		const frames = [frame("a"), frame("b"), frame("c"), frame("d")];
		const edges = [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")];
		expect(arrange([...frames].reverse(), [...edges].reverse())).toEqual(arrange(frames, edges));
	});

	it("holds a lane open for a walk that skips a rank", () => {
		// a → b → c and a → c: the long walk must not sit on top of b
		const rects = arrange([frame("a"), frame("b"), frame("c")], [edge("a", "b"), edge("b", "c"), edge("a", "c")]);
		expect(at(rects, "a").y).toBeLessThan(at(rects, "b").y);
		expect(at(rects, "b").y).toBeLessThan(at(rects, "c").y);
		// b is pushed off the a–c centre line by the lane the long walk holds
		expect(at(rects, "b").x).not.toBe(at(rects, "a").x);
	});

	it("keeps the reading order of frames the graph says nothing about", () => {
		// nothing links these, so the layout has no opinion: the order the hands
		// left them in is the only information there is, and it survives
		const rects = arrange([frame("zulu", 0, 0), frame("alpha", 2000, 0)], []);
		expect(at(rects, "zulu").x).toBeLessThan(at(rects, "alpha").x);
	});

	it("returns nothing for no frames", () => {
		expect(arrange([], [])).toEqual({});
	});

	it("places a lone frame without moving it", () => {
		expect(arrange([frame("only", 42, 84)], [])).toEqual({ only: { x: 42, y: 84, w: 1440, h: 900 } });
	});
});

describe("packRank", () => {
	it("gives each slot what it wants when the gutters already fit", () => {
		expect(packRank([0, 300], [100, 100], 100)).toEqual([0, 300]);
	});

	it("opens two overlapping slots to exactly the gutter, splitting the move", () => {
		// both want 0; the pair must end 200 apart (50 + 100 + 50)
		const placed = packRank([0, 0], [100, 100], 100);
		expect(placed[1] ?? 0).toBeCloseTo((placed[0] ?? 0) + 200, 5);
		// least squares moves each the same distance from its wish
		expect(placed[0]).toBeCloseTo(-100, 5);
		expect(placed[1]).toBeCloseTo(100, 5);
	});

	it("never reorders: a slot wanting to sit left of its predecessor is pooled", () => {
		const placed = packRank([500, 0], [100, 100], 100);
		expect(placed[0] ?? 0).toBeLessThan(placed[1] ?? 0);
		expect(placed[1] ?? 0).toBeCloseTo((placed[0] ?? 0) + 200, 5);
	});

	it("respects each slot's own width", () => {
		const placed = packRank([0, 0], [1440, 400], 100);
		expect(placed[1] ?? 0).toBeCloseTo((placed[0] ?? 0) + 720 + 100 + 200, 5);
	});

	it("has nothing to place for an empty rank", () => {
		expect(packRank([], [], 100)).toEqual([]);
	});
});
