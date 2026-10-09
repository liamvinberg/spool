import { describe, expect, it } from "vitest";
import {
	check,
	defaultLayout,
	type Env,
	fitWindow,
	isLayout,
	type Layout,
	maxWidth,
	reduce,
	resizeSplit,
	stackHeights,
} from "./pane-layout";

/**
 * The pane layout as data: two sides of the canvas, each a rail of icons and a
 * stack of the panes lit on it. Every case here goes through the model's own
 * verbs and reads what a person would see back out of `fitWindow`.
 */

const WIDE: Env = { width: 1440, height: 900 };

const shown = (layout: Layout, env: Env = WIDE) => {
	const f = fitWindow(layout, env);
	return { left: f.left.shown, right: f.right.shown };
};

describe("the default layout", () => {
	it("shows Pages on the left and Properties on the right, with Agent waiting on the right rail", () => {
		const layout = defaultLayout();
		expect(layout.left.rail).toEqual(["pages"]);
		expect(layout.right.rail).toEqual(["properties", "agent"]);
		expect(shown(layout)).toEqual({ left: ["pages"], right: ["properties"] });
	});

	it("leaves the canvas what the two rails and two stacks do not take", () => {
		const f = fitWindow(defaultLayout(), WIDE);
		// 44 + 248 on the left, 300 + 44 on the right
		expect(f.canvas).toBe(1440 - 292 - 344);
	});
});

describe("clicking a rail icon", () => {
	it("lights an unlit pane under the ones already showing, in rail order", () => {
		const layout = reduce(defaultLayout(), { type: "click", pane: "agent" }, WIDE);
		expect(shown(layout).right).toEqual(["properties", "agent"]);
	});

	it("turns a showing pane off and leaves the rest of the stack", () => {
		const both = reduce(defaultLayout(), { type: "click", pane: "agent" }, WIDE);
		const layout = reduce(both, { type: "click", pane: "properties" }, WIDE);
		expect(shown(layout).right).toEqual(["agent"]);
	});

	it("collapses the side to its rail when the last pane goes off, and brings it back on the next click", () => {
		const shut = reduce(defaultLayout(), { type: "click", pane: "properties" }, WIDE);
		expect(fitWindow(shut, WIDE).right.open).toBe(false);
		expect(fitWindow(shut, WIDE).canvas).toBe(1440 - 292 - 44);

		const back = reduce(shut, { type: "click", pane: "properties" }, WIDE);
		expect(shown(back).right).toEqual(["properties"]);
	});

	it("remembers a split while the side is collapsed", () => {
		const both = reduce(defaultLayout(), { type: "click", pane: "agent" }, WIDE);
		const shut = reduce(both, { type: "open", side: "right", open: false }, WIDE);
		expect(shown(shut).right).toEqual([]);

		const back = reduce(shut, { type: "click", pane: "agent" }, WIDE);
		expect(shown(back).right).toEqual(["properties", "agent"]);
	});

	it("shows only the pane ⌥-clicked", () => {
		const both = reduce(defaultLayout(), { type: "click", pane: "agent" }, WIDE);
		const layout = reduce(both, { type: "click", pane: "agent", only: true }, WIDE);
		expect(shown(layout).right).toEqual(["agent"]);
	});
});

describe("opening and collapsing a side", () => {
	it("opens a side that never had anything lit on its first pane", () => {
		const moved = reduce(defaultLayout(), { type: "click", pane: "pages" }, WIDE);
		expect(shown(moved).left).toEqual([]);
		const back = reduce(moved, { type: "open", side: "left", open: true }, WIDE);
		expect(shown(back).left).toEqual(["pages"]);
	});
});

describe("moving a pane", () => {
	it("splits a pane into the bottom half of one showing on the other side", () => {
		const layout = reduce(
			defaultLayout(),
			{ type: "move", pane: "properties", to: { kind: "stack", side: "left", anchor: "pages", edge: "below" } },
			WIDE,
		);
		expect(layout.left.rail).toEqual(["pages", "properties"]);
		expect(shown(layout)).toEqual({ left: ["pages", "properties"], right: [] });
		// the split halves the pane it splits
		expect(layout.weights.pages).toBe(layout.weights.properties);
	});

	it("splits above, and lights a pane that was not showing", () => {
		const layout = reduce(
			defaultLayout(),
			{ type: "move", pane: "agent", to: { kind: "stack", side: "right", anchor: "properties", edge: "above" } },
			WIDE,
		);
		expect(layout.right.rail).toEqual(["agent", "properties"]);
		expect(shown(layout).right).toEqual(["agent", "properties"]);
	});

	it("reorders a rail, and the stack follows the rail's order", () => {
		const both = reduce(defaultLayout(), { type: "click", pane: "agent" }, WIDE);
		const layout = reduce(both, { type: "move", pane: "agent", to: { kind: "rail", side: "right", index: 0 } }, WIDE);
		expect(layout.right.rail).toEqual(["agent", "properties"]);
		expect(shown(layout).right).toEqual(["agent", "properties"]);
	});

	it("carries a showing pane to the other rail and shows it there", () => {
		const layout = reduce(
			defaultLayout(),
			{ type: "move", pane: "properties", to: { kind: "rail", side: "left", index: 1 } },
			WIDE,
		);
		expect(layout.left.rail).toEqual(["pages", "properties"]);
		expect(layout.right.rail).toEqual(["agent"]);
		expect(shown(layout)).toEqual({ left: ["pages", "properties"], right: [] });
	});

	it("carries an unlit pane to the other rail without showing it", () => {
		const layout = reduce(
			defaultLayout(),
			{ type: "move", pane: "agent", to: { kind: "rail", side: "left", index: 0 } },
			WIDE,
		);
		expect(layout.left.rail).toEqual(["agent", "pages"]);
		expect(shown(layout)).toEqual({ left: ["pages"], right: ["properties"] });
	});

	it("hands back the same layout for a drop that changes nothing", () => {
		const layout = defaultLayout();
		expect(reduce(layout, { type: "move", pane: "agent", to: { kind: "rail", side: "right", index: 2 } }, WIDE)).toBe(
			layout,
		);
	});
});

describe("hiding and removing", () => {
	it("hides a pane the way clicking its lit icon does", () => {
		const both = reduce(defaultLayout(), { type: "click", pane: "agent" }, WIDE);
		expect(shown(reduce(both, { type: "hide", pane: "agent" }, WIDE)).right).toEqual(["properties"]);
	});

	it("takes a removed pane off its rail, and shows it again where it stood", () => {
		const removed = reduce(defaultLayout(), { type: "remove", pane: "properties" }, WIDE);
		expect(removed.right.rail).toEqual(["agent"]);
		expect(shown(removed).right).toEqual([]);

		const back = reduce(removed, { type: "show", pane: "properties" }, WIDE);
		expect(back.right.rail).toEqual(["properties", "agent"]);
		expect(shown(back).right).toEqual(["properties"]);
		expect(back.removed).toEqual({});
	});

	it("shows a pane by its key on a collapsed side, and leaves a showing one where it is", () => {
		const shut = reduce(defaultLayout(), { type: "open", side: "left", open: false }, WIDE);
		expect(shown(reduce(shut, { type: "show", pane: "pages" }, WIDE)).left).toEqual(["pages"]);

		const layout = defaultLayout();
		expect(shown(reduce(layout, { type: "show", pane: "properties" }, WIDE))).toEqual(shown(layout));
	});
});

describe("widths", () => {
	it("keeps a side between 200 and 480 wide", () => {
		expect(reduce(defaultLayout(), { type: "width", side: "left", width: 120 }, WIDE).left.width).toBe(200);
		expect(reduce(defaultLayout(), { type: "width", side: "left", width: 900 }, WIDE).left.width).toBe(480);
		expect(maxWidth(defaultLayout(), "left", WIDE)).toBe(480);
		expect(reduce(defaultLayout(), { type: "width", side: "left", width: 320 }, WIDE).left.width).toBe(320);
	});

	it("keeps a side showing the agent between 380 and 560 wide (#364)", () => {
		const agent = reduce(defaultLayout(), { type: "show", pane: "agent" }, WIDE);
		expect(reduce(agent, { type: "width", side: "right", width: 200 }, WIDE).right.width).toBe(380);
		expect(reduce(agent, { type: "width", side: "right", width: 900 }, WIDE).right.width).toBe(560);
		expect(reduce(agent, { type: "width", side: "right", width: 440 }, WIDE).right.width).toBe(440);
		// a width saved narrower draws at the agent's floor while the agent shows
		expect(fitWindow(agent, WIDE).right.width).toBe(380);
		expect(maxWidth(agent, "right", WIDE)).toBe(560);
		// hiding the agent brings the side back under every other pane's ceiling
		const wide = reduce(agent, { type: "width", side: "right", width: 540 }, WIDE);
		expect(fitWindow(reduce(wide, { type: "hide", pane: "agent" }, WIDE), WIDE).right.width).toBe(480);
	});

	it("never lets a drag take the canvas under 480", () => {
		const env = { width: 1100, height: 900 };
		// the right takes 344, the left rail 44: 1100 - 344 - 44 - 480 leaves 232 for the left stack
		expect(reduce(defaultLayout(), { type: "width", side: "left", width: 400 }, env).left.width).toBe(232);
	});
});

describe("a narrow window", () => {
	it("folds the side touched least recently to its rail, and opens it again once there is room", () => {
		const narrow = { width: 1000, height: 900 };
		const f = fitWindow(defaultLayout(), narrow);
		expect(f.left.open).toBe(false);
		expect(f.right.open).toBe(true);
		expect(f.canvas).toBeGreaterThanOrEqual(480);
		expect(fitWindow(defaultLayout(), WIDE).left.open).toBe(true);
	});

	it("folds the other side instead once the left was the one touched last", () => {
		const touched = reduce(defaultLayout(), { type: "touch", side: "left" });
		const f = fitWindow(touched, { width: 1000, height: 900 });
		expect(f.left.open).toBe(true);
		expect(f.right.open).toBe(false);
	});
});

describe("refusing a drop", () => {
	/** Pages over Properties on the left, and Agent alone on a collapsed right */
	const twoLeft = () =>
		reduce(
			defaultLayout(),
			{ type: "move", pane: "properties", to: { kind: "stack", side: "left", anchor: "pages", edge: "below" } },
			WIDE,
		);

	it("lets a drop that fits land", () => {
		expect(
			check(defaultLayout(), "agent", { kind: "stack", side: "left", anchor: "pages", edge: "below" }, WIDE),
		).toBe("ok");
	});

	it("calls a drop that changes nothing a no-op", () => {
		expect(check(defaultLayout(), "agent", { kind: "rail", side: "right", index: 2 }, WIDE)).toBe("noop");
	});

	it("refuses a fourth pane on a side", () => {
		const two = twoLeft();
		const extra = {
			...two,
			left: { ...two.left, rail: ["pages", "properties", "notes"], lit: ["pages", "properties", "notes"] },
		};
		expect(check(extra, "agent", { kind: "stack", side: "left", anchor: "pages", edge: "below" }, WIDE)).toBe("cap");
	});

	it("refuses a split that would put a pane under 160px", () => {
		const short = { width: 1440, height: 300 };
		expect(
			check(defaultLayout(), "agent", { kind: "stack", side: "right", anchor: "properties", edge: "below" }, short),
		).toBe("height");
	});

	it("refuses to open a side where the canvas would go under 480", () => {
		const narrow = { width: 900, height: 900 };
		// 900 - 292 on the left - 44 rail - 480 leaves 84, under the side's 200 minimum
		expect(check(twoLeft(), "properties", { kind: "rail", side: "right", index: 0 }, narrow)).toBe("floor");
	});
});

describe("stack heights", () => {
	it("shares the height by weight, in whole pixels", () => {
		expect(stackHeights([1, 1], 900)).toEqual([450, 450]);
		expect(stackHeights([1, 2], 900)).toEqual([300, 600]);
	});

	it("holds every pane at 160 or more", () => {
		expect(stackHeights([0.1, 1], 900)).toEqual([160, 740]);
	});

	it("lets a divider move only as far as both neighbours stay 160 tall", () => {
		expect(resizeSplit([450, 450], 0, 100)).toEqual([550, 350]);
		expect(resizeSplit([450, 450], 0, 400)).toEqual([740, 160]);
		expect(resizeSplit([450, 450], 0, -400)).toEqual([160, 740]);
	});
});

describe("the stored layout", () => {
	const PANES = ["pages", "properties", "agent"];
	const accepts = isLayout(PANES);
	const changed = () =>
		reduce(reduce(defaultLayout(), { type: "click", pane: "agent" }, WIDE), { type: "remove", pane: "pages" }, WIDE);

	it("takes back exactly what the model wrote, through JSON", () => {
		expect(accepts(JSON.parse(JSON.stringify(defaultLayout())))).toBe(true);
		expect(accepts(JSON.parse(JSON.stringify(changed())))).toBe(true);
	});

	it("discards anything that is not today's shape rather than migrating it", () => {
		const layout = defaultLayout();
		const broken: unknown[] = [
			null,
			"properties",
			{ ...layout, v: 2 },
			{ ...layout, left: { ...layout.left, rail: "pages" } },
			// a pane twice, a pane missing, a pane nobody registered
			{ ...layout, right: { ...layout.right, rail: ["properties", "agent", "pages"] } },
			{ ...layout, right: { ...layout.right, rail: ["properties"], lit: ["properties"] } },
			{ ...layout, left: { ...layout.left, rail: ["pages", "notes"] } },
			// lit off its rail, too many lit
			{ ...layout, left: { ...layout.left, lit: ["agent"] } },
			{ ...layout, right: { ...layout.right, lit: ["properties", "agent", "properties", "agent"] } },
			// a width no side is ever left at, a share that is not a share
			{ ...layout, left: { ...layout.left, width: 90 } },
			{ ...layout, weights: { ...layout.weights, agent: 0 } },
			{ ...layout, removed: { pages: { side: "up", index: 0 } } },
		];
		for (const value of broken) expect(accepts(value)).toBe(false);
	});
});
