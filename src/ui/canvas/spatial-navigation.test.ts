import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import {
	MAX_SPATIAL_DISTANCE,
	nextSpatialFrame,
	type SpatialDirection,
	type SpatialTrail,
	stepSpatially,
} from "./spatial-navigation";

const frame = (name: string, x: number, y: number, w = 100, h = 100): ProjectedFrame => ({
	name,
	x,
	y,
	w,
	h,
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

	it("prefers the local frame group to anything past its fixed boundary", () => {
		const origin = frame("origin", 0, 0);
		const atBoundary = frame("at-boundary", origin.w + MAX_SPATIAL_DISTANCE, 0);
		const nearDiagonal = frame("near-diagonal", 300, 150);
		const outsideAligned = frame("outside-aligned", origin.w + MAX_SPATIAL_DISTANCE + 1, 0);

		expect(nextSpatialFrame(origin, [origin, atBoundary], "right")?.name).toBe("at-boundary");
		expect(nextSpatialFrame(origin, [origin, nearDiagonal, outsideAligned], "right")?.name).toBe(
			"near-diagonal",
		);
	});

	it("takes the nearest frame that way when nothing is within reach", () => {
		const origin = frame("origin", 0, 0);
		const farAligned = frame("far-aligned", 5000, 0);
		const nearerDiagonal = frame("nearer-diagonal", 1200, 900);
		const behind = frame("behind", -200, 0);

		expect(nextSpatialFrame(origin, [origin, farAligned, nearerDiagonal, behind], "right")?.name).toBe(
			"nearer-diagonal",
		);
		expect(nextSpatialFrame(origin, [origin, farAligned], "right")?.name).toBe("far-aligned");
	});

	it("breaks equal geometry by name", () => {
		const origin = frame("origin", 0, 0);
		const z = frame("z", 180, 0);
		const a = frame("a", 180, 0);

		expect(nextSpatialFrame(origin, [origin, z, a], "right")?.name).toBe("a");
	});
});

describe("stepping along a trail", () => {
	const walk = (frames: ProjectedFrame[], start: string, directions: SpatialDirection[]): string[] => {
		let trail: SpatialTrail | null = null;
		let at = start;
		const visited: string[] = [];
		for (const direction of directions) {
			const from = frames.find((f) => f.name === at);
			if (from === undefined) throw new Error(at);
			const step = stepSpatially(from, frames, direction, trail);
			if (step !== undefined) {
				at = step.target.name;
				trail = step.trail;
			}
			visited.push(at);
		}
		return visited;
	};

	it("returns to the frame it came from, though geometry would pick another", () => {
		// "right" overlaps both in its beam, so ← from it alone would pick "high" by name
		const frames = [frame("high", 0, 0), frame("low", 0, 100), frame("right", 180, 50)];
		expect(nextSpatialFrame(frames[2] as ProjectedFrame, frames, "left")?.name).toBe("high");
		expect(walk(frames, "low", ["right", "left"])).toEqual(["right", "low"]);
	});

	it("unwinds several steps in reverse", () => {
		const frames = [frame("a", 0, 0), frame("b", 180, 40), frame("c", 180, 220), frame("d", 0, 260)];
		expect(walk(frames, "a", ["right", "down", "up", "left"])).toEqual(["b", "c", "b", "a"]);
	});

	it("starts over when the selection moved some other way", () => {
		const frames = [frame("high", 0, 0), frame("low", 0, 100), frame("right", 180, 50)];
		const low = frames[1] as ProjectedFrame;
		const right = frames[2] as ProjectedFrame;
		const step = stepSpatially(low, frames, "right", null);
		expect(step?.trail).toEqual({ at: "right", back: [{ name: "low", direction: "right" }] });
		// standing on "high" now, not where the trail landed
		const high = frames[0] as ProjectedFrame;
		expect(stepSpatially(high, frames, "right", step?.trail ?? null)?.trail.back).toEqual([
			{ name: "high", direction: "right" },
		]);
		expect(stepSpatially(right, frames, "left", null)?.target.name).toBe("high");
	});

	it("falls back to geometry when the frame it came from is gone", () => {
		const frames = [frame("high", 0, 0), frame("right", 180, 50)];
		const right = frames[1] as ProjectedFrame;
		const trail: SpatialTrail = { at: "right", back: [{ name: "low", direction: "right" }] };
		expect(stepSpatially(right, frames, "left", trail)?.target.name).toBe("high");
	});
});
