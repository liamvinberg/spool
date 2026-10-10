import { describe, expect, it } from "vitest";
import { windowEdge } from "./window-edge";

describe("the window's left edge", () => {
	it("hands each move to its followers, and says when the edge is another place's", () => {
		const edge = windowEdge();
		const seen: [number, boolean][] = [];
		edge.follow((at, moved) => seen.push([at, moved]));
		const side = {};
		const home = {};
		edge.report(side, 248);
		edge.report(side, 300);
		edge.report(side, 300);
		edge.report(home, 208);
		expect(seen).toEqual([
			[248, false],
			[300, false],
			[208, true],
		]);
	});

	it("keeps the last edge for a follower that comes later", () => {
		const edge = windowEdge();
		edge.report({}, 44);
		const seen: number[] = [];
		const stop = edge.follow((at) => seen.push(at));
		stop();
		edge.report({}, 90);
		expect(seen).toEqual([44]);
	});
});
