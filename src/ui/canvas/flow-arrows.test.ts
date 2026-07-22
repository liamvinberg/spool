import { describe, expect, it } from "vitest";
import type { FlowEdge, ProjectedFrame } from "../api";
import { routeArrows } from "./flow-arrows";

/**
 * The arrow layout (#34): per-site arrows growing out of their element,
 * angle-based side choice with spread at the target edge — the geometry that
 * killed the midpoint pileup. Asserted on tails and tips; the cubic between
 * them is presentation.
 */

const frame = (name: string, x: number, y: number, w = 400, h = 800): ProjectedFrame =>
	({ name, x, y, w, h }) as ProjectedFrame;

const edge = (from: string, to: string, sites: FlowEdge["sites"]): FlowEdge => ({
	from,
	to,
	certainty: sites.some((s) => s.conditional === undefined) ? "will" : "might",
	sites,
});

const site = (line: number, col = 4, conditional = false) => ({
	via: "data-go" as const,
	path: "frames/a/frame.tsx",
	line,
	...(conditional ? { conditional: true as const } : {}),
	anchor: { line, col },
});

const anchorKey = (line: number, col = 4) => `frames/a/frame.tsx:${line}:${col}`;

describe("routeArrows", () => {
	it("each site grows its own arrow out of its element's edge point", () => {
		const frames = [frame("a", 0, 0), frame("b", 1000, 0)];
		const edges = [edge("a", "b", [site(4), site(9)])];
		const boxes = {
			a: {
				[anchorKey(4)]: { x: 40, y: 80, w: 200, h: 40 },
				[anchorKey(9)]: { x: 40, y: 560, w: 200, h: 40 },
			},
		};

		const arrows = routeArrows(edges, frames, boxes, 1);

		expect(arrows).toHaveLength(2);
		// both leave a's right edge at their element's height, not a shared midpoint
		expect(arrows.map((arrow) => arrow.tail.x)).toEqual([400, 400]);
		expect(arrows[0]?.tail.y).toBe(100);
		expect(arrows[1]?.tail.y).toBe(580);
	});

	it("a site without a located element falls back to the frame edge midline", () => {
		const frames = [frame("a", 0, 0), frame("b", 1000, 0)];
		const edges = [edge("a", "b", [site(4)])];

		const arrows = routeArrows(edges, frames, {}, 1);

		expect(arrows[0]?.tail).toEqual({ x: 400, y: 400 });
	});

	it("arrows arriving at one target edge spread instead of piling up", () => {
		const frames = [frame("a", 0, 0), frame("b", 0, 1000), frame("c", 1000, 500)];
		const edges = [edge("a", "c", [site(4)]), edge("b", "c", [site(4)])];

		const arrows = routeArrows(edges, frames, {}, 1);

		const tips = arrows.map((arrow) => arrow.tip);
		// both enter c's left edge — at distinct, spread points
		expect(tips.every((tip) => tip.x === 1000)).toBe(true);
		const [first, second] = tips;
		expect(first !== undefined && second !== undefined && Math.abs(first.y - second.y)).toBeGreaterThanOrEqual(28);
		// tails above and below keep their vertical order at the target
		expect(first !== undefined && second !== undefined && first.y < second.y).toBe(true);
	});

	it("the spool-demo regression: near-diagonal edges no longer chain through shared points", () => {
		// menu → cart declared, cart → receipt, receipt → menu: the dx/dy
		// knife-edge that once chained three arrows into a fake menu ↔ receipt line
		const frames = [
			frame("menu", 0, 0, 390, 844),
			frame("cart", 600, 597, 390, 844),
			frame("receipt", 1200, 0, 390, 844),
		];
		const edges = [
			edge("menu", "cart", [site(4)]),
			edge("cart", "receipt", [site(4)]),
			edge("receipt", "menu", [site(4)]),
		];

		const arrows = routeArrows(edges, frames, {}, 1);

		const points = arrows.flatMap((arrow) => [arrow.tail, arrow.tip]).map((p) => `${p.x},${p.y}`);
		expect(new Set(points).size).toBe(points.length);
	});

	it("a branched site draws faint; an unconditional one solid", () => {
		const frames = [frame("a", 0, 0), frame("b", 1000, 0), frame("c", 1000, 900)];
		const edges = [edge("a", "b", [site(4, 4, true)]), edge("a", "c", [site(9)])];

		const arrows = routeArrows(edges, frames, {}, 1);

		expect(arrows.map((arrow) => arrow.faint)).toEqual([true, false]);
	});

	it("self-links and edges off the field draw nothing", () => {
		const frames = [frame("a", 0, 0)];
		const edges = [edge("a", "a", [site(4)]), edge("a", "gone", [site(9)])];

		expect(routeArrows(edges, frames, {}, 1)).toEqual([]);
	});
});
