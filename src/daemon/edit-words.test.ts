import { describe, expect, it } from "vitest";
import { collapsedWords } from "./edit-words";

/**
 * The words an element is already drawing (#324), which is what an edit opens
 * on so the `pre-wrap` Chromium forces has nothing left to reflow.
 */
describe("collapsedWords", () => {
	it("collapses every run of whitespace to one space", () => {
		expect(collapsedWords(["Make  something\n\t\tworth feeling."])).toEqual(["Make something worth feeling."]);
	});

	it("drops the space that would begin the first run or end the last", () => {
		expect(collapsedWords(["\n\tRodebjer\n"])).toEqual(["Rodebjer"]);
		expect(collapsedWords(["\n\tone ", "two\n"])).toEqual(["one ", "two"]);
	});

	it("never draws two spaces across the join between two runs", () => {
		expect(collapsedWords(["one ", " two"])).toEqual(["one ", "two"]);
	});

	it("keeps a whitespace-only run between words as the one space it draws", () => {
		expect(collapsedWords(["one", "\n\t", "two"])).toEqual(["one", " ", "two"]);
	});

	it("drops a whitespace-only run at either end, where nothing is drawn", () => {
		expect(collapsedWords(["\n\t", "only", "\n"])).toEqual(["", "only", ""]);
	});

	it("leaves words the engine was already drawing exactly as they are", () => {
		expect(collapsedWords(["Rodebjer", " ", "Marketing Director"])).toEqual([
			"Rodebjer",
			" ",
			"Marketing Director",
		]);
	});
});
