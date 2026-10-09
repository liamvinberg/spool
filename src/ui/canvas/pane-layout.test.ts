import { describe, expect, it } from "vitest";
import {
	check,
	type Drop,
	defaultLayout,
	type Env,
	fitWindow,
	isLayout,
	type Layout,
	maxWidth,
	RAIL_WIDTH,
	reduce,
	resizeSplit,
	type SideId,
	stackHeights,
	whereIs,
} from "./pane-layout";

/**
 * The pane layout as data: two sides of the canvas, each a stack of groups of
 * tabs, open or closed to a rail. Every case here goes through the model's own
 * verbs and reads what a person would see back out of `fitWindow`.
 */

const WIDE: Env = { width: 1440, height: 900 };

const tabsOf = (layout: Layout, side: SideId) => layout[side].groups.map((group) => [...group.tabs]);
const activeOf = (layout: Layout, side: SideId) => layout[side].groups.map((group) => group.active);
const shown = (layout: Layout, env: Env = WIDE) => {
	const f = fitWindow(layout, env);
	return { left: f.left.shown, right: f.right.shown };
};
const move = (layout: Layout, pane: string, to: Drop) => reduce(layout, { type: "move", pane, to }, WIDE);

/** Agent split out under Properties on the right */
const split = () => move(defaultLayout(), "agent", { kind: "split", side: "right", group: 0, where: "below" });

describe("the default layout", () => {
	it("holds Pages on the left and Properties with Agent as tabs on the right, Properties showing", () => {
		const layout = defaultLayout();
		expect(tabsOf(layout, "left")).toEqual([["pages"]]);
		expect(tabsOf(layout, "right")).toEqual([["properties", "agent"]]);
		expect(shown(layout)).toEqual({ left: ["pages"], right: ["properties"] });
	});

	it("sizes each side by what it holds, so the right is the agent's width whichever tab shows", () => {
		const f = fitWindow(defaultLayout(), WIDE);
		expect(f.left.width).toBe(248);
		expect(f.right.width).toBe(380);
		expect(f.canvas).toBe(1440 - 248 - 380);
		const agent = reduce(defaultLayout(), { type: "show", pane: "agent" }, WIDE);
		expect(fitWindow(agent, WIDE).right.width).toBe(380);
	});

	it("gives a side holding Properties and no Agent 300", () => {
		const layout = move(defaultLayout(), "agent", { kind: "row", side: "left", group: 0, index: 1 });
		expect(fitWindow(layout, WIDE).right.width).toBe(300);
		expect(fitWindow(layout, WIDE).left.width).toBe(380);
	});
});

describe("showing a pane", () => {
	it("makes its tab the active one in its group", () => {
		const layout = reduce(defaultLayout(), { type: "show", pane: "agent" }, WIDE);
		expect(activeOf(layout, "right")).toEqual(["agent"]);
		expect(shown(layout).right).toEqual(["agent"]);
	});

	it("opens a closed side on that pane", () => {
		const shut = reduce(defaultLayout(), { type: "open", side: "right", open: false }, WIDE);
		expect(shown(shut).right).toEqual([]);
		const back = reduce(shut, { type: "show", pane: "agent" }, WIDE);
		expect(fitWindow(back, WIDE).right.open).toBe(true);
		expect(shown(back).right).toEqual(["agent"]);
	});

	it("leaves the tabs as they are when it already shows", () => {
		const layout = defaultLayout();
		const again = reduce(layout, { type: "show", pane: "properties" }, WIDE);
		expect(again.right.groups).toEqual(layout.right.groups);
		expect(again.right.open).toBe(true);
	});
});

describe("opening and closing a side", () => {
	it("closes a side to a 40px rail, and opens it as it was", () => {
		const shut = reduce(defaultLayout(), { type: "open", side: "right", open: false }, WIDE);
		const f = fitWindow(shut, WIDE);
		expect(f.right.open).toBe(false);
		expect(f.right.outer).toBe(RAIL_WIDTH);
		expect(f.canvas).toBe(1440 - 248 - RAIL_WIDTH);
		const open = reduce(shut, { type: "open", side: "right", open: true }, WIDE);
		expect(shown(open).right).toEqual(["properties"]);
	});

	it("leaves no rail for a side holding nothing, and will not open it", () => {
		const empty = move(defaultLayout(), "pages", { kind: "row", side: "right", group: 0, index: 2 });
		expect(tabsOf(empty, "left")).toEqual([]);
		expect(fitWindow(empty, WIDE).left.outer).toBe(0);
		expect(reduce(empty, { type: "open", side: "left", open: true }, WIDE)).toBe(empty);
	});
});

describe("moving a tab", () => {
	it("moves a tab into another row at the slot it was dropped on, and shows it there", () => {
		const layout = move(defaultLayout(), "agent", { kind: "row", side: "left", group: 0, index: 0 });
		expect(tabsOf(layout, "left")).toEqual([["agent", "pages"]]);
		expect(activeOf(layout, "left")).toEqual(["agent"]);
		expect(tabsOf(layout, "right")).toEqual([["properties"]]);
	});

	it("hands the light to a neighbour when the shown tab leaves", () => {
		const layout = move(defaultLayout(), "properties", { kind: "row", side: "left", group: 0, index: 1 });
		expect(activeOf(layout, "right")).toEqual(["agent"]);
	});

	it("reorders tabs within a row", () => {
		const layout = move(defaultLayout(), "properties", { kind: "row", side: "right", group: 0, index: 2 });
		expect(tabsOf(layout, "right")).toEqual([["agent", "properties"]]);
	});

	it("splits a tab into a group of its own below the pane it was dropped on", () => {
		const layout = split();
		expect(tabsOf(layout, "right")).toEqual([["properties"], ["agent"]]);
		expect(shown(layout).right).toEqual(["properties", "agent"]);
		// a fresh split halves the group it splits
		expect(layout.right.groups.map((group) => group.weight)).toEqual([0.5, 0.5]);
	});

	it("splits above", () => {
		const layout = move(defaultLayout(), "pages", { kind: "split", side: "right", group: 0, where: "above" });
		expect(tabsOf(layout, "right")).toEqual([["pages"], ["properties", "agent"]]);
		expect(tabsOf(layout, "left")).toEqual([]);
	});

	it("merges a group into the one above, and the group left empty goes", () => {
		const layout = move(split(), "agent", { kind: "row", side: "right", group: 0, index: 1 });
		expect(tabsOf(layout, "right")).toEqual([["properties", "agent"]]);
		expect(layout.right.groups[0]?.weight).toBe(1);
	});

	it("starts a side's first group from a drop on an empty side's edge, and opens it", () => {
		const empty = move(defaultLayout(), "pages", { kind: "row", side: "right", group: 0, index: 2 });
		const back = move(empty, "agent", { kind: "row", side: "left", group: 0, index: 0 });
		expect(tabsOf(back, "left")).toEqual([["agent"]]);
		expect(fitWindow(back, WIDE).left.open).toBe(true);
	});

	it("opens a closed side a tab is dropped onto", () => {
		const shut = reduce(defaultLayout(), { type: "open", side: "left", open: false }, WIDE);
		const layout = move(shut, "agent", { kind: "row", side: "left", group: 0, index: 1 });
		expect(fitWindow(layout, WIDE).left.open).toBe(true);
	});

	it("hands back the same layout for a drop that changes nothing", () => {
		const layout = defaultLayout();
		expect(move(layout, "pages", { kind: "split", side: "left", group: 0, where: "below" })).toBe(layout);
		expect(move(layout, "pages", { kind: "row", side: "left", group: 0, index: 0 })).toBe(layout);
		expect(move(layout, "agent", { kind: "row", side: "right", group: 0, index: 2 })).toBe(layout);
	});

	it("finds where a pane stands", () => {
		expect(whereIs(split(), "agent")).toEqual({ side: "right", group: 1 });
		expect(whereIs(split(), "nothing")).toBeNull();
	});
});

describe("widths", () => {
	it("keeps a side without the agent between 200 and 480 wide", () => {
		const left = (width: number) => fitWindow(reduce(defaultLayout(), { type: "width", side: "left", width }), WIDE);
		expect(left(100).left.width).toBe(200);
		expect(left(900).left.width).toBe(480);
	});

	it("keeps a side holding the agent between 380 and 560 wide", () => {
		const right = (width: number) =>
			fitWindow(reduce(defaultLayout(), { type: "width", side: "right", width }), WIDE);
		expect(right(200).right.width).toBe(380);
		expect(right(900).right.width).toBe(560);
	});

	it("never lets a drag take the canvas under 480", () => {
		const narrow = { width: 1200, height: 900 };
		expect(maxWidth(defaultLayout(), "left", narrow)).toBe(1200 - 480 - 380);
	});
});

describe("a narrow window", () => {
	it("closes the side touched least recently to its rail, and opens it again once there is room", () => {
		const narrow = { width: 1000, height: 900 };
		const f = fitWindow(defaultLayout(), narrow);
		expect(f.left.open).toBe(false);
		expect(f.right.open).toBe(true);
		expect(f.left.outer).toBe(RAIL_WIDTH);
		expect(fitWindow(defaultLayout(), WIDE).left.open).toBe(true);
	});

	it("closes the other side instead once the left was the one touched last", () => {
		const touched = reduce(defaultLayout(), { type: "touch", side: "left" });
		const f = fitWindow(touched, { width: 1000, height: 900 });
		expect(f.left.open).toBe(true);
		expect(f.right.open).toBe(false);
	});
});

describe("refusing a drop", () => {
	it("lets a drop that fits land", () => {
		expect(check(defaultLayout(), "agent", { kind: "split", side: "right", group: 0, where: "below" }, WIDE)).toBe(
			"ok",
		);
	});

	it("calls a drop that changes nothing a no-op", () => {
		expect(check(defaultLayout(), "pages", { kind: "split", side: "left", group: 0, where: "above" }, WIDE)).toBe(
			"noop",
		);
	});

	it("refuses a fourth group on a side", () => {
		const three = move(split(), "pages", { kind: "split", side: "right", group: 1, where: "below" });
		expect(tabsOf(three, "right")).toHaveLength(3);
		const pagesBack = move(three, "properties", { kind: "split", side: "right", group: 2, where: "below" });
		// a lone group moving within its side keeps the count
		expect(tabsOf(pagesBack, "right")).toHaveLength(3);
		const crowded: Layout = {
			...three,
			left: { ...three.left, groups: [{ tabs: ["notes"], active: "notes", weight: 1 }] },
		};
		expect(check(crowded, "notes", { kind: "split", side: "right", group: 0, where: "below" }, WIDE)).toBe("cap");
	});

	it("refuses a split that would leave a group under 160px", () => {
		expect(
			check(
				defaultLayout(),
				"agent",
				{ kind: "split", side: "right", group: 0, where: "below" },
				{
					width: 1440,
					height: 300,
				},
			),
		).toBe("height");
	});

	it("refuses to open a side where the canvas would go under 480", () => {
		const shut = reduce(defaultLayout(), { type: "open", side: "right", open: false }, WIDE);
		// the left, emptied, takes nothing, and the right opening at the agent's 380 leaves the canvas 470
		const narrow = { width: 850, height: 900 };
		expect(check(shut, "pages", { kind: "row", side: "right", group: 0, index: 0 }, narrow)).toBe("floor");
	});
});

describe("group heights", () => {
	it("shares the height by weight, in whole pixels", () => {
		expect(stackHeights([1, 1], 900)).toEqual([450, 450]);
		expect(stackHeights([1, 2], 900)).toEqual([300, 600]);
	});

	it("holds every group at 160 or more", () => {
		expect(stackHeights([0.1, 1], 900)).toEqual([160, 740]);
	});

	it("lets a divider move only as far as both neighbours stay 160 tall", () => {
		expect(resizeSplit([450, 450], 0, 100)).toEqual([550, 350]);
		expect(resizeSplit([450, 450], 0, 400)).toEqual([740, 160]);
		expect(resizeSplit([450, 450], 0, -400)).toEqual([160, 740]);
	});

	it("takes a divider's weights", () => {
		const layout = reduce(split(), { type: "weights", side: "right", weights: [600, 300] });
		expect(layout.right.groups.map((group) => group.weight)).toEqual([600, 300]);
	});
});

describe("the stored layout", () => {
	const PANES = ["pages", "properties", "agent"];
	const accepts = isLayout(PANES);

	it("takes back exactly what the model wrote, through JSON", () => {
		expect(accepts(JSON.parse(JSON.stringify(defaultLayout())))).toBe(true);
		const changed = reduce(split(), { type: "width", side: "left", width: 320 }, WIDE);
		expect(accepts(JSON.parse(JSON.stringify(changed)))).toBe(true);
	});

	it("discards anything that is not today's shape rather than migrating it", () => {
		const layout = defaultLayout();
		const right = layout.right;
		const broken: unknown[] = [
			null,
			"properties",
			{ ...layout, v: 2 },
			// the toggles' shape, from before tabs
			{ ...layout, v: 2, left: { panes: ["pages"], lit: ["pages"], width: 248, open: true, touched: 1 } },
			{ ...layout, left: { ...layout.left, groups: "pages" } },
			// a pane twice, a pane missing, a pane nobody registered
			{
				...layout,
				right: { ...right, groups: [{ tabs: ["properties", "agent", "pages"], active: "agent", weight: 1 }] },
			},
			{ ...layout, right: { ...right, groups: [{ tabs: ["properties"], active: "properties", weight: 1 }] } },
			{ ...layout, left: { ...layout.left, groups: [{ tabs: ["pages", "notes"], active: "pages", weight: 1 }] } },
			// an active tab off its group, an empty group, a bad weight, four groups
			{ ...layout, right: { ...right, groups: [{ tabs: ["properties", "agent"], active: "pages", weight: 1 }] } },
			{
				...layout,
				right: {
					...right,
					groups: [
						{ tabs: [], active: "agent", weight: 1 },
						{ tabs: ["properties", "agent"], active: "agent", weight: 1 },
					],
				},
			},
			{ ...layout, right: { ...right, groups: [{ tabs: ["properties", "agent"], active: "agent", weight: 0 }] } },
			// a width no side is left at
			{ ...layout, left: { ...layout.left, width: 40 } },
			{ ...layout, left: { ...layout.left, width: "wide" } },
		];
		for (const value of broken) expect(accepts(value)).toBe(false);
	});
});
