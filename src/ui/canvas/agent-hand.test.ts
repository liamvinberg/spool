import { describe, expect, it } from "vitest";
import { markKeyOf, rangeKeyOf } from "./agent-hand";

describe("the key two sides of one question agree on", () => {
	it("spells a range apart from a stamp, because they are different questions", () => {
		expect(rangeKeyOf("frames/home/frame.tsx", 4, 9)).toBe("frames/home/frame.tsx:4-9");
		expect(markKeyOf("home", "call-1")).toBe("home:call-1");
	});
});
