import { describe, expect, it } from "vitest";
import { clipWindow, type RecordedInput, shapedBox } from "./record-protocol";

const move = (t: number): RecordedInput => ({ t, kind: "move", x: t, y: 0, button: 0 });

describe("clipWindow", () => {
	it("keeps the whole recording of a frame that plays itself", () => {
		expect(clipWindow([], 8000)).toEqual({ start: 0, end: 8000 });
	});

	it("runs from just before the first input to a beat after the last", () => {
		const inputs = [move(2000), { t: 3000, kind: "down", x: 0, y: 0, button: 0 } as const];
		expect(clipWindow(inputs, 9000)).toEqual({ start: 1700, end: 3500 });
	});

	it("cuts the last stroke when it leaves the frame: that is the hand going for the stop button", () => {
		const inputs = [
			move(1000),
			{ t: 1200, kind: "up", x: 0, y: 0, button: 0 } as const,
			move(4000),
			move(4016),
			move(4032),
		];
		expect(clipWindow([...inputs, { t: 4040, kind: "leave" }], 5000)).toEqual({ start: 700, end: 4000 });
	});
});

describe("shapedBox", () => {
	it("plays the frame at the post's shape, as large as fits with a margin", () => {
		expect(shapedBox("16:9", { w: 1440, h: 870 })).toEqual({ w: 1376, h: 774 });
		expect(shapedBox("1:1", { w: 1440, h: 870 })).toEqual({ w: 806, h: 806 });
		expect(shapedBox("frame", { w: 1440, h: 870 })).toBeNull();
	});
});
