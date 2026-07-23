import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import { MAX_SPATIAL_DISTANCE, nextSpatialFrame, type SpatialDirection } from "./spatial-navigation";

const frame = (name: string, x: number, y: number, w = 100, h = 100): ProjectedFrame => ({
	name,
	x,
	y,
	w,
	h,
	hasThumb: false,
});

describe("spatial frame navigation", () => {
	it.each([
		["left", frame("left", -180, 0)],
		["right", frame("right", 180, 0)],
		["up", frame("up", 0, -180)],
		["down", frame("down", 0, 180)],
	] satisfies [SpatialDirection, ProjectedFrame][])(
		"moves to the nearest frame %s of the origin",
		(direction, target) => {
			const origin = frame("origin", 0, 0);
			expect(nextSpatialFrame(origin, [origin, target], direction)?.name).toBe(target.name);
		},
	);

	it("prefers the directional beam over a closer diagonal", () => {
		const origin = frame("origin", 0, 0);
		const diagonal = frame("diagonal", 110, 105);
		const aligned = frame("aligned", 300, 40);

		expect(nextSpatialFrame(origin, [origin, diagonal, aligned], "right")?.name).toBe("aligned");
	});

	it("uses facing edges rather than frame centers for distance", () => {
		const origin = frame("origin", 0, 0);
		const wide = frame("wide", 110, 0, 500);
		const narrow = frame("narrow", 150, 0, 20);

		expect(nextSpatialFrame(origin, [origin, wide, narrow], "right")?.name).toBe("wide");
	});

	it("uses forward distance before lateral distance outside the beam", () => {
		const origin = frame("origin", 0, 0);
		const nearBeam = frame("near-beam", 250, 120);
		const farBeam = frame("far-beam", 150, 300);

		expect(nextSpatialFrame(origin, [origin, farBeam, nearBeam], "right")?.name).toBe("far-beam");
	});

	it("stays put at the edge of the field", () => {
		const origin = frame("origin", 0, 0);
		const left = frame("left", -180, 0);

		expect(nextSpatialFrame(origin, [origin, left], "right")).toBeUndefined();
	});

	it("does not cross the fixed boundary of a local frame group", () => {
		const origin = frame("origin", 0, 0);
		const atBoundary = frame("at-boundary", origin.w + MAX_SPATIAL_DISTANCE, 0);
		const outside = frame("outside", origin.w + MAX_SPATIAL_DISTANCE + 1, 0);

		expect(nextSpatialFrame(origin, [origin, atBoundary], "right")?.name).toBe("at-boundary");
		expect(nextSpatialFrame(origin, [origin, outside], "right")).toBeUndefined();
	});

	it("breaks equal geometry by name", () => {
		const origin = frame("origin", 0, 0);
		const z = frame("z", 180, 0);
		const a = frame("a", 180, 0);

		expect(nextSpatialFrame(origin, [origin, z, a], "right")?.name).toBe("a");
	});
});
