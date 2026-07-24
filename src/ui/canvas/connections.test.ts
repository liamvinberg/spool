import { describe, expect, it } from "vitest";
import type { FlowEdge, ProjectedFrame } from "../api";
import { connectionGroups, outboundCount } from "./connections";

/**
 * The rail's connections tab (#58): one frame's whole outbound list, read from
 * the derived graph. Same-page and cross-page destinations are treated
 * identically — this list is the only home for the ones no arrow can reach.
 */

function frame(name: string, page?: string): ProjectedFrame {
	return { name, kind: "html", x: 0, y: 0, w: 100, h: 100, hasThumb: false, ...(page === undefined ? {} : { page }) };
}

function edge(from: string, to: string, extra: Partial<FlowEdge> = {}): FlowEdge {
	return { from, to, certainty: "will", sites: [], ...extra };
}

const frames: ProjectedFrame[] = [frame("home"), frame("cart"), frame("checkout", "shop"), frame("receipt", "shop")];

describe("connectionGroups", () => {
	it("groups a frame's outbound links by page, treating its own page like any other", () => {
		const groups = connectionGroups("checkout", [edge("checkout", "cart"), edge("checkout", "receipt")], frames);

		// the root page leads because it always does, not because checkout links there
		expect(groups.map((group) => group.page)).toEqual(["", "shop"]);
		expect(groups[0]?.rows.map((row) => row.target)).toEqual(["cart"]);
		expect(groups[1]?.rows.map((row) => row.target)).toEqual(["receipt"]);
	});

	it("carries the page each link lands on, so an off-page row can switch pages", () => {
		const groups = connectionGroups("home", [edge("home", "checkout"), edge("home", "cart")], frames);

		expect(groups.map((group) => group.page)).toEqual(["", "shop"]);
		expect(groups[0]?.rows.map((row) => row.target)).toEqual(["cart"]);
		expect(groups[1]?.rows.map((row) => row.target)).toEqual(["checkout"]);
		// off-page rows carry the page they land on: activating one switches pages
		expect(groups[1]?.rows[0]).toMatchObject({ page: "shop", missing: false });
	});

	it("carries certainty and the verified mark onto each row", () => {
		const groups = connectionGroups(
			"home",
			[edge("home", "cart", { certainty: "might" }), edge("home", "checkout", { verified: true })],
			frames,
		);

		expect(groups[0]?.rows[0]).toMatchObject({ target: "cart", certainty: "might", verified: false });
		expect(groups[1]?.rows[0]).toMatchObject({ target: "checkout", certainty: "will", verified: true });
	});

	it("flags a destination no frame answers to, and gives it its own group last", () => {
		const groups = connectionGroups("home", [edge("home", "ghost", { missing: true }), edge("home", "cart")], frames);

		expect(groups.map((group) => group.page)).toEqual(["", null]);
		expect(groups[1]?.rows[0]).toMatchObject({ target: "ghost", missing: true, page: null });
	});

	it("sorts each group by name and ignores edges that leave another frame", () => {
		const groups = connectionGroups(
			"home",
			[edge("home", "cart"), edge("cart", "checkout"), edge("home", "home")],
			frames,
		);

		expect(groups).toHaveLength(1);
		// a frame that navigates to itself is a real outbound link, listed like any other
		expect(groups[0]?.rows.map((row) => row.target)).toEqual(["cart", "home"]);
	});
});

describe("outboundCount", () => {
	it("counts one frame's outbound destinations", () => {
		const edges = [edge("home", "cart"), edge("home", "checkout"), edge("cart", "home")];

		expect(outboundCount("home", edges)).toBe(2);
		expect(outboundCount("receipt", edges)).toBe(0);
	});
});
