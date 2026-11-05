import { expect, it } from "vitest";
import type { RecordedInput } from "../runtime/record-protocol";
import { cursorTrack, IDLE_MS } from "./record-cursor";

const STEP = 1000 / 60;

it("smooths the hand's tremor but clicks exactly where the hand clicked", () => {
	// a hand shaking a few pixels either side of y=100 as it moves right, then a click at 200,100
	const inputs: RecordedInput[] = [];
	for (let i = 0; i <= 60; i++)
		inputs.push({ t: i * STEP, kind: "move", x: 100 + i * (100 / 60), y: 100 + (i % 2 ? 3 : -3), button: 0 });
	inputs.push(
		{ t: 61 * STEP, kind: "down", x: 200, y: 100, button: 0 },
		{ t: 66 * STEP, kind: "up", x: 200, y: 100, button: 0 },
	);
	const track = cursorTrack(inputs, 70, STEP);
	const middle = track.slice(20, 40).map((place) => Math.abs((place?.y ?? 0) - 100));
	expect(Math.max(...middle)).toBeLessThan(0.5);
	expect(track[63]).toMatchObject({ x: 200, y: 100 });
});

it("draws no cursor before the hand arrives, fades it once it rests, and brings it back on a move", () => {
	const inputs: RecordedInput[] = [
		{ t: 500, kind: "move", x: 10, y: 10, button: 0 },
		{ t: 4000, kind: "move", x: 20, y: 10, button: 0 },
	];
	const track = cursorTrack(inputs, 300, STEP);
	expect(track[10]).toBeNull();
	const at = (ms: number) => track[Math.round(ms / STEP)]?.opacity;
	expect(at(800)).toBe(1);
	expect(at(500 + IDLE_MS + 1000)).toBe(0);
	expect(at(4300)).toBe(1);
});
