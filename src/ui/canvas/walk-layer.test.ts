import { describe, expect, it } from "vitest";
import type { FlowEdge, FlowUnreadable, ProjectedFrame } from "../api";
import { placeWalks, WIDEST_TAG, walksOf } from "./walk-layer";

/**
 * The walk layer (#151): what the flow map knows and an arrow cannot draw.
 * Same-page edges are the arrows and never appear here. What does: a walk that
 * lands on another page, and a walk that lands nowhere at all.
 *
 * Asserted on the derivation and on where each mark lands in world space. The
 * hairline between the anchor and the tag is presentation, and the tag's own
 * words are the component's.
 */

const frame = (name: string, x: number, y: number, page?: string, w = 400, h = 800): ProjectedFrame =>
	({ name, x, y, w, h, ...(page === undefined ? {} : { page }) }) as ProjectedFrame;

const edge = (from: string, to: string, extra: Partial<FlowEdge> = {}): FlowEdge => ({
	from,
	to,
	certainty: "will",
	sites: [],
	...extra,
});

const dark = (frame: string, path: string, line: number): FlowUnreadable => ({ frame, path, line });

describe("walksOf", () => {
	it("says nothing about an edge both of whose ends are on this page", () => {
		const here = [frame("a", 0, 0), frame("b", 1000, 0)];

		expect(walksOf([edge("a", "b")], [], here, here)).toEqual([]);
	});

	it("names a walk that lands on another page, with the page it lands on", () => {
		const here = [frame("cart", 0, 0)];
		const all = [...here, frame("checkout", 0, 0, "shop")];

		expect(walksOf([edge("cart", "checkout")], [], here, all)).toEqual([
			{ kind: "exit", frame: "cart", target: "checkout", page: "shop", certainty: "will" },
		]);
	});

	it("carries certainty, which is the one distinction the arrows already spend", () => {
		const here = [frame("cart", 0, 0)];
		const all = [...here, frame("home", 0, 0, "site")];

		const walks = walksOf([edge("cart", "home", { certainty: "might" })], [], here, all);

		expect(walks[0]).toMatchObject({ kind: "exit", certainty: "might" });
	});

	it("names a destination no frame answers to as a fault, wherever it would have been", () => {
		const here = [frame("cart--empty", 0, 0)];

		expect(walksOf([edge("cart--empty", "chekout", { missing: true })], [], here, here)).toEqual([
			{ kind: "fault", frame: "cart--empty", name: "chekout", why: "missing", path: undefined },
		]);
	});

	it("names a walk whose destination cannot be read by where it is written", () => {
		const here = [frame("cart--empty", 0, 0)];

		expect(walksOf([], [dark("cart--empty", "shared/ui/nav.tsx", 12)], here, here)).toEqual([
			{ kind: "fault", frame: "cart--empty", name: "nav.tsx:12", why: "unreadable", path: "shared/ui/nav.tsx" },
		]);
	});

	it("draws nothing for a frame that is not on this page", () => {
		const here = [frame("cart", 0, 0)];
		const all = [...here, frame("pay", 0, 0, "shop"), frame("gone", 0, 0, "shop")];

		expect(walksOf([edge("pay", "gone")], [dark("pay", "a.tsx", 1)], here, all)).toEqual([]);
	});

	it("draws nothing for a walk back to the frame it leaves", () => {
		const here = [frame("cart", 0, 0)];

		expect(walksOf([edge("cart", "cart")], [], here, here)).toEqual([]);
	});

	it("says one dark line once, however many sites share it", () => {
		const here = [frame("cart", 0, 0)];
		const twice = [dark("cart", "shared/ui/nav.tsx", 12), dark("cart", "shared/ui/nav.tsx", 12)];

		expect(walksOf([], twice, here, here)).toHaveLength(1);
	});

	it("puts the exits first, so a fault is always the last thing on a wall", () => {
		const here = [frame("cart", 0, 0)];
		const all = [...here, frame("checkout", 0, 0, "shop")];
		const edges = [edge("cart", "chekout", { missing: true }), edge("cart", "checkout")];

		expect(walksOf(edges, [dark("cart", "nav.tsx", 3)], here, all).map((walk) => walk.kind)).toEqual([
			"exit",
			"fault",
			"fault",
		]);
	});
});

describe("placeWalks", () => {
	const cart = frame("cart", 100, 200);
	const here = [cart];
	const all = [...here, frame("checkout", 0, 0, "shop"), frame("home", 0, 0, "site")];
	const twoExits = [edge("cart", "checkout"), edge("cart", "home")];

	it("docks every mark on the frame's own wall, below the channel the arrows own", () => {
		const [group] = placeWalks(walksOf([edge("cart", "checkout")], [], here, all), here, 1);

		expect(group?.frame).toBe("cart");
		expect(group?.size).toBe("readable");
		// the right wall, 25 under the mid-height an arrow leaves from
		expect(group?.marks[0]?.ax).toBe(500);
		expect(group?.marks[0]?.ay).toBe(200 + 400 + 25);
	});

	it("fans a stack, so two leaders spread instead of running parallel", () => {
		const [group] = placeWalks(walksOf(twoExits, [], here, all), here, 1);
		const [first, second] = group?.marks ?? [];

		// the anchors sit tighter on the wall than the tags they reach
		expect((second?.ay ?? 0) - (first?.ay ?? 0)).toBe(13);
		expect((second?.ey ?? 0) - (first?.ey ?? 0)).toBe(21);
	});

	it("runs an exit's leader into its tag and a fault's leader short of one", () => {
		const walks = walksOf([edge("cart", "checkout"), edge("cart", "chekout", { missing: true })], [], here, all);
		const [group] = placeWalks(walks, here, 1);
		const [exit, fault] = group?.marks ?? [];

		// an exit ends where its words begin: the tag is the door
		expect(exit?.tagX).toBe(exit?.ex);
		// a fault stops, and its report sits past the stop — the gap is the tell
		expect(fault?.tagX).toBe((fault?.ex ?? 0) + 9);
		expect(fault?.stop).toBe(true);
		expect(exit?.stop).toBe(false);
	});

	it("keeps every measure at constant screen size, so the camera never fattens a leader", () => {
		const [one] = placeWalks(walksOf([edge("cart", "checkout")], [], here, all), here, 1);
		const [half] = placeWalks(walksOf([edge("cart", "checkout")], [], here, all), here, 0.5);

		// world measures halve as the camera does, so the drawing holds its size
		expect((half?.marks[0]?.ay ?? 0) - 600).toBe(50);
		expect((one?.marks[0]?.ay ?? 0) - 600).toBe(25);
		expect((half?.marks[0]?.ex ?? 0) - 500).toBe(40);
		expect((one?.marks[0]?.ex ?? 0) - 500).toBe(20);
	});

	it("degrades to nubs once the frame is narrower on screen than its widest tag", () => {
		// 400 of frame at 30% is 120 screen pixels: still wider than the words
		expect(placeWalks(walksOf(twoExits, [], here, all), here, WIDEST_TAG / 400)[0]?.size).toBe("readable");
		// a hair under, and the words are wider than the rectangle they label
		expect(placeWalks(walksOf(twoExits, [], here, all), here, WIDEST_TAG / 400 - 0.001)[0]?.size).toBe("nub");
	});

	it("stacks nubs tighter than tags, because six pixels of fan is a fan nobody reads", () => {
		const nubs = placeWalks(walksOf(twoExits, [], here, all), here, 0.1)[0];
		const [first, second] = nubs?.marks ?? [];

		expect(nubs?.size).toBe("nub");
		// no bend and no fan: the leader is a stub, and the stack is 6 apart
		expect(((second?.ay ?? 0) - (first?.ay ?? 0)) * 0.1).toBeCloseTo(6);
		expect(first?.ey).toBe(first?.ay);
	});

	it("keeps a fault's stop at survey distance, which is the whole point of having one", () => {
		const fault = walksOf([edge("cart", "chekout", { missing: true })], [], here, all);

		expect(placeWalks(fault, here, 0.1)[0]?.marks[0]?.stop).toBe(true);
	});

	it("leaves a frame with nothing to say off the layer entirely", () => {
		expect(placeWalks([], here, 1)).toEqual([]);
	});
});
