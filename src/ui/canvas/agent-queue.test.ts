import { describe, expect, it } from "vitest";
import { type AgentQueued, handedBack, handedBackReference } from "./agent-queue";

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

/**
 * The reference that rode with those words comes home too (#119).
 *
 * A message carries at most one and the box holds at most one, so a handover of several
 * has more references than slots. What must never happen is the silent drop: a picture
 * that was going out with a message has to be visible again in the box it returns to.
 */
describe("the reference handed back", () => {
	const shot = { media: "image/png", data: "AAAA" };
	const held = (id: string, over: Partial<AgentQueued> = {}): AgentQueued => ({ id, text: id, ...over });

	it("comes back into an empty slot", () => {
		expect(handedBackReference([held("one", { attached: shot })], null)).toEqual(shot);
	});

	it("leaves the box's own alone, because the hand is holding that one", () => {
		const box = { media: "image/jpeg", data: "BBBB" };

		expect(handedBackReference([held("one", { attached: shot })], box)).toEqual(box);
	});

	it("takes the first in fire order, which is the order everything else here uses", () => {
		const second = { media: "image/jpeg", data: "BBBB" };

		expect(
			handedBackReference([held("one"), held("two", { attached: shot }), held("three", { attached: second })], null),
		).toEqual(shot);
	});

	it("is nothing when nothing rode with any of them", () => {
		expect(handedBackReference([held("one"), held("two", { attached: null })], null)).toBeNull();
		expect(handedBackReference([], null)).toBeNull();
	});
});
