import { describe, expect, it } from "vitest";
import { readSlideSource } from "./slide-source";

const slide = (body: string, imports = 'import { ui } from "spool";') =>
	`${imports}\nexport default function Slide() {\n${body}\n\treturn <p />;\n}\n`;

describe("a slide's source, read without running it", () => {
	it("reads the beats written out in the call, however they are typed, and whether it is live", () => {
		expect(readSlideSource(slide('\tconst beat = ui.beats(["title", `price`] as const);\n\tui.live();'))).toEqual({
			beats: ["title", "price"],
			live: true,
			notesImports: [],
		});
		// the same list read again by a part of the slide is still one list
		expect(readSlideSource(slide('\tui.beats(["a", "b"]);\n\tui.beats(["a", "b"]);')).beats).toEqual(["a", "b"]);
		// another module's `ui`, or none at all, names no beats
		expect(readSlideSource(slide('\tui.beats(["a"]);', 'import { ui } from "./mine";')).beats).toEqual([]);
	});

	it("names where a list is not one it can read, and why", () => {
		const unread = (body: string) => readSlideSource(slide(body)).unread;
		expect(unread("\tui.beats(NAMES);")).toMatchObject({
			line: 3,
			column: 2,
			message: expect.stringContaining("written out"),
		});
		expect(unread('\tui.beats([...BASE, "end"]);')?.message).toContain("written out");
		expect(unread('\tui.beats(["a", "b", "a"]);')?.message).toContain('"a" twice');
		expect(unread("\tui.beats([]);")?.message).toContain("names no beat");
		expect(unread('\tui.beats(["a"]);\n\tui.beats(["b"]);')?.message).toContain("two different lists");
	});

	it("finds every import of a notes.md", () => {
		const read = readSlideSource(
			slide(
				'\tconst more = import("./notes.md?raw");',
				'import { ui } from "spool";\nimport words from "./notes.md";',
			),
		);
		expect(read.notesImports).toEqual([
			{ line: 2, column: 19, specifier: "./notes.md" },
			{ line: 4, column: 22, specifier: "./notes.md?raw" },
		]);
	});
});
