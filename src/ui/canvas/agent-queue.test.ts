import { describe, expect, it } from "vitest";
import { handedBack, handedBackReferences } from "./agent-queue";

/**
 * Words that leave the queue un-fired land back in the box (#170).
 *
 * One invariant covers both exits, which is why there is one function to test: a stop
 * cancels the queue and hands every word back, and taking one back by hand is the
 * same act with the same outcome for the words involved.
 */
describe("words handed back", () => {
	it("lands them above the draft with a blank line", () => {
		// above rather than below on two counts, neither of them taste: the queue's order
		// is the order these were going to be said in, so appending would reverse a held
		// message against the one being written — and the caret is mid-sentence, so
		// anything landing under it moves the words the hand is on
		expect(handedBack(["hold off on add-habit"], "make the header sticky and give the")).toBe(
			"hold off on add-habit\n\nmake the header sticky and give the",
		);
	});

	it("keeps a stop's whole queue in fire order, one blob with a splittable seam", () => {
		const back = handedBack(["hold off on add-habit", "swedish weekday chips"], "and while you are there");

		expect(back).toBe("hold off on add-habit\n\nswedish weekday chips\n\nand while you are there");
		// the round trip is not lossless — two messages coming back are one field and one
		// Enter — and the blank line is what leaves the seam visible enough to split by
		// hand. Three messages, three seams, nothing glued
		expect(back.split("\n\n")).toHaveLength(3);
	});

	it("takes the box alone when there was nothing being written", () => {
		expect(handedBack(["hold off on add-habit"], "")).toBe("hold off on add-habit");
		expect(handedBack(["one", "two"], "")).toBe("one\n\ntwo");
	});

	it("leaves a draft untouched when nothing came back", () => {
		// a stop against an empty queue is still a stop, and it must not disturb the words
		// the hand is in the middle of
		expect(handedBack([], "half a sentence")).toBe("half a sentence");
		expect(handedBack([""], "half a sentence")).toBe("half a sentence");
	});
});

describe("references handed back", () => {
	it("returns every queued image ahead of the images already in the composer", () => {
		const first = { media: "image/png", data: "AAAA" };
		const second = { media: "image/jpeg", data: "BBBB" };
		const held = { media: "image/webp", data: "CCCC" };
		expect(
			handedBackReferences(
				[
					{ id: "one", text: "one", attached: [first, second] },
					{ id: "two", text: "two", attached: [first] },
				],
				[held],
			),
		).toEqual([first, second, first, held]);
	});
});
