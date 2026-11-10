import { describe, expect, it } from "vitest";
import { deckFileBytes, newDeckFile, parseDeckFile, withAbsent } from "./deck-file";

describe("deck.json", () => {
	it("reads forgivingly and writes back what it did not understand, one name per line", () => {
		const read = parseDeckFile(
			JSON.stringify({
				theme: { ink: "dark" },
				slides: ["title", 3, "../escape", "sense", "title", "", "close"],
				w: 99999,
				h: "tall",
			}),
		);
		expect(read).toEqual({
			kind: "deck",
			// a file with no version is version 1; a size out of bounds is held to them, one not a number is the default
			file: expect.objectContaining({ size: { w: 3840, h: 720 }, slides: ["title", "sense", "close"] }),
			repeated: ["title"],
		});
		if (read.kind !== "deck") return;
		const bytes = deckFileBytes(read.file);
		expect(bytes).toBe(
			[
				"{",
				'\t"version": 1,',
				'\t"w": 3840,',
				'\t"h": 720,',
				'\t"slides": [',
				'\t\t"title",',
				'\t\t"sense",',
				'\t\t"close"',
				"\t],",
				'\t"theme": {',
				'\t\t"ink": "dark"',
				"\t}",
				"}",
				"",
			].join("\n"),
		);
		// written once, the bytes read back to themselves
		const again = parseDeckFile(bytes);
		expect(again.kind === "deck" && deckFileBytes(again.file)).toBe(bytes);
	});

	it("never writes a name twice, whatever list it is handed", () => {
		const file = newDeckFile(["a", "b", "a"]);
		expect(file.slides).toEqual(["a", "b"]);
		expect(deckFileBytes({ ...file, slides: ["b", "a", "b"] })).toContain('"slides": [\n\t\t"b",\n\t\t"a"\n\t]');
	});

	it("is no deck while its bytes do not parse, and none this spool lays out at another version", () => {
		expect(parseDeckFile('{ "version": 1, "slides": ["a",')).toEqual({ kind: "unparsed" });
		expect(parseDeckFile("[]")).toEqual({ kind: "unparsed" });
		expect(parseDeckFile('{ "version": 2, "slides": [] }')).toEqual({ kind: "unknown", version: 2 });
	});

	it("keeps a listed frame that is not there yet in its place through a change to the talk", () => {
		const present = new Set(["title", "sense", "close"]);
		// "chart" stands before "close"; "outro" at the end
		const listed = ["title", "sense", "chart", "close", "outro"];
		expect(withAbsent(listed, present, ["close", "title", "sense"])).toEqual([
			"chart",
			"close",
			"title",
			"sense",
			"outro",
		]);
		// the frame it stood before left the talk: it goes to the end rather than away
		expect(withAbsent(listed, present, ["title", "sense"])).toEqual(["title", "sense", "chart", "outro"]);
	});
});
