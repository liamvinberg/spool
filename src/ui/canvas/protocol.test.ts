import { describe, expect, it } from "vitest";
import { parseFrameMessage } from "./protocol";

describe("frame zoom protocol", () => {
	it("accepts entered-frame pinch and shortcut intents", () => {
		const wheel = {
			spool: "zoom",
			frame: "host",
			kind: "wheel",
			x: 12,
			y: 34,
			deltaY: -20,
			deltaMode: 0,
		};
		const shortcut = { spool: "zoom", frame: "host", kind: "out" };

		expect(parseFrameMessage(wheel)).toEqual(wheel);
		expect(parseFrameMessage(shortcut)).toEqual(shortcut);
	});

	it("rejects malformed zoom intents", () => {
		expect(parseFrameMessage({ spool: "zoom", frame: "host", kind: "wheel", deltaY: -20 })).toBeUndefined();
		expect(parseFrameMessage({ spool: "zoom", frame: "host", kind: "huge" })).toBeUndefined();
	});
});
