import { expect, it } from "vitest";
import { HOLD_MS, HOLD_PX, makePen, POINTER_COLOURS, WHEEL_STEP } from "./pointer";
import { parsePointer } from "./stage-wire";

it("counts a quick press as a click, and a long, travelled or scrolled one as a hold", () => {
	const pen = makePen();
	pen.press(100, 100, 0);
	expect(pen.state.down).toBe(true);
	pen.release(HOLD_MS - 1);
	expect(pen.state).toEqual({ down: false, colour: 0, taps: 1 });

	pen.press(100, 100, 1000);
	pen.release(1000 + HOLD_MS);
	pen.press(100, 100, 2000);
	pen.move(100 + HOLD_PX + 1, 100);
	pen.release(2010);
	pen.press(100, 100, 3000);
	pen.wheel(1);
	pen.release(3010);
	expect(pen.state.taps).toBe(1);
});

it("turns the colour with the wheel only while the button is down, a step per notch, round and back", () => {
	const pen = makePen();
	expect(pen.wheel(-WHEEL_STEP)).toBe(false);
	expect(pen.state.colour).toBe(0);
	pen.press(0, 0, 0);
	// a trackpad's small deltas add up to one step
	for (let i = 0; i < 4; i++) pen.wheel(-WHEEL_STEP / 4);
	expect(pen.state.colour).toBe(1);
	expect(pen.wheel(WHEEL_STEP * 2)).toBe(true);
	expect(pen.state.colour).toBe(POINTER_COLOURS.length - 1);
	pen.release(500);
	// the colour stays once the button is up
	expect(pen.state.colour).toBe(POINTER_COLOURS.length - 1);
});

it("reads a pointer from a stage before the pen as up, red and never clicked", () => {
	expect(parsePointer({ x: 0.5, y: 0.25 })).toEqual({ x: 0.5, y: 0.25, down: false, colour: 0, taps: 0 });
	expect(parsePointer({ x: 0.5, y: 0.25, down: true, colour: 2, taps: 3 })).toEqual({
		x: 0.5,
		y: 0.25,
		down: true,
		colour: 2,
		taps: 3,
	});
	expect(parsePointer({ x: 0.5, y: 0.25, colour: 99 })?.colour).toBe(0);
});
