import { describe, expect, it } from "vitest";
import type { FlowEdge, ProjectedFrame } from "../api";
import { placeWalks, WIDEST_TAG, walksOf } from "./walk-layer";

/**
 * The walk layer (#151, amended by #203): the walks this page can take that no
 * arrow can reach. Same-page edges are the arrows and never appear here; a walk
 * that lands nowhere is not drawn at all, because there is nowhere to press.
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

describe("walksOf", () => {
	it("says nothing about an edge both of whose ends are on this page", () => {
		const here = [frame("a", 0, 0), frame("b", 1000, 0)];

		expect(walksOf([edge("a", "b")], here, here)).toEqual([]);
	});

	it("names a walk that lands on another page, with the page it lands on", () => {
		const here = [frame("cart", 0, 0)];
		const all = [...here, frame("checkout", 0, 0, "shop")];

		expect(walksOf([edge("cart", "checkout")], here, all)).toEqual([
			{ frame: "cart", target: "checkout", page: "shop", certainty: "will" },
		]);
	});

	it("carries certainty, which is the one distinction the arrows already spend", () => {
		const here = [frame("cart", 0, 0)];
		const all = [...here, frame("home", 0, 0, "site")];

		expect(walksOf([edge("cart", "home", { certainty: "might" })], here, all)[0]?.certainty).toBe("might");
	});

	/**
	 * The canvas draws what you can act on (#203). A dead walk cannot be
	 * pressed and its fix is in source, so it lives in `spool flows` and in
	 * what an agent reads. The dogfood canvas settled this: eight marks on one
	 * page, five distinct names, and not one of them a mistake — every one a
	 * walk to a frame nobody had drawn yet.
	 */
	it("draws nothing for a destination no frame answers to", () => {
		const here = [frame("cart--empty", 0, 0)];

		expect(walksOf([edge("cart--empty", "chekout", { missing: true })], here, here)).toEqual([]);
	});

	it("draws nothing for a target that is on no page at all", () => {
		const here = [frame("cart--empty", 0, 0)];

		expect(walksOf([edge("cart--empty", "ghost")], here, here)).toEqual([]);
	});

	it("draws nothing for a frame that is not on this page", () => {
		const here = [frame("cart", 0, 0)];
		const all = [...here, frame("pay", 0, 0, "shop"), frame("gone", 0, 0, "site")];

		expect(walksOf([edge("pay", "gone")], here, all)).toEqual([]);
	});

	it("draws nothing for a walk back to the frame it leaves", () => {
		const here = [frame("cart", 0, 0)];

		expect(walksOf([edge("cart", "cart")], here, here)).toEqual([]);
	});

	it("orders by frame then target, so a wall's stack never reshuffles under you", () => {
		const here = [frame("cart", 0, 0), frame("account", 0, 0)];
		const all = [...here, frame("checkout", 0, 0, "shop"), frame("home", 0, 0, "site")];
		const edges = [edge("cart", "home"), edge("account", "checkout"), edge("cart", "checkout")];

		expect(walksOf(edges, here, all).map((walk) => `${walk.frame}->${walk.target}`)).toEqual([
			"account->checkout",
			"cart->checkout",
			"cart->home",
		]);
	});
});

describe("placeWalks", () => {
	const cart = frame("cart", 100, 200);
	const here = [cart];
	const all = [...here, frame("checkout", 0, 0, "shop"), frame("home", 0, 0, "site")];
	const twoWalks = [edge("cart", "checkout"), edge("cart", "home")];

	it("docks every mark on the frame's own wall, below the channel the arrows own", () => {
		const [group] = placeWalks(walksOf([edge("cart", "checkout")], here, all), here, 1);

		expect(group?.frame).toBe("cart");
		expect(group?.size).toBe("readable");
		// the right wall, 25 under the mid-height an arrow leaves from
		expect(group?.marks[0]?.ax).toBe(500);
		expect(group?.marks[0]?.ay).toBe(200 + 400 + 25);
	});

	it("fans a stack, so two leaders spread instead of running parallel", () => {
		const [group] = placeWalks(walksOf(twoWalks, here, all), here, 1);
		const [first, second] = group?.marks ?? [];

		// the anchors sit tighter on the wall than the tags they reach
		expect((second?.ay ?? 0) - (first?.ay ?? 0)).toBe(13);
		expect((second?.ey ?? 0) - (first?.ey ?? 0)).toBe(21);
	});

	it("keeps every measure at constant screen size, so the camera never fattens a leader", () => {
		const [one] = placeWalks(walksOf([edge("cart", "checkout")], here, all), here, 1);
		const [half] = placeWalks(walksOf([edge("cart", "checkout")], here, all), here, 0.5);

		// world measures halve as the camera does, so the drawing holds its size
		expect((half?.marks[0]?.ay ?? 0) - 600).toBe(50);
		expect((one?.marks[0]?.ay ?? 0) - 600).toBe(25);
		expect((half?.marks[0]?.ex ?? 0) - 500).toBe(40);
		expect((one?.marks[0]?.ex ?? 0) - 500).toBe(20);
	});

	it("degrades to nubs once the frame is narrower on screen than its widest tag", () => {
		// 400 of frame at 30% is 120 screen pixels: still wider than the words
		expect(placeWalks(walksOf(twoWalks, here, all), here, WIDEST_TAG / 400)[0]?.size).toBe("readable");
		// a hair under, and the words are wider than the rectangle they label
		expect(placeWalks(walksOf(twoWalks, here, all), here, WIDEST_TAG / 400 - 0.001)[0]?.size).toBe("nub");
	});

	it("stacks nubs tighter than tags, because six pixels of fan is a fan nobody reads", () => {
		const nubs = placeWalks(walksOf(twoWalks, here, all), here, 0.1)[0];
		const [first, second] = nubs?.marks ?? [];

		expect(nubs?.size).toBe("nub");
		// no bend and no fan: the leader is a stub, and the stack is 6 apart
		expect(((second?.ay ?? 0) - (first?.ay ?? 0)) * 0.1).toBeCloseTo(6);
		expect(first?.ey).toBe(first?.ay);
	});

	it("leaves a frame with nothing to say off the layer entirely", () => {
		expect(placeWalks([], here, 1)).toEqual([]);
	});
});
