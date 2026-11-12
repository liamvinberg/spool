import { describe, expect, it } from "vitest";
import { beatAsked, readSlideSource } from "./slide-source";

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

	it("finds the beat a shot asks for by its name or its number from 1, and says what there is when it is not one", () => {
		const read = readSlideSource(slide('\tui.beats(["title", "price", "close"]);'));
		expect(beatAsked("talk/a", read, "price")).toBe(1);
		expect(beatAsked("talk/a", read, "3")).toBe(2);
		expect(beatAsked("talk/a", read, "4")).toEqual({
			message:
				'talk/a has no beat "4": its beats are "title", "price", "close", or 1 to 3 counted from 1 (beat.index counts from 0)',
		});
		expect(beatAsked("talk/a", read, "0")).toMatchObject({ message: expect.stringContaining("counted from 1") });
		expect(beatAsked("talk/a", read, "closing")).toEqual({
			message: 'talk/a has no beat "closing": its beats are "title", "price", "close", or 1 to 3',
		});
		// a slide that names none has one beat, its whole self
		expect(beatAsked("talk/b", readSlideSource(slide("")), "1")).toBe(0);
		expect(beatAsked("talk/b", readSlideSource(slide("")), "title")).toMatchObject({
			message: expect.stringContaining("one beat"),
		});
		expect(beatAsked("talk/c", readSlideSource(slide("\tui.beats(NAMES);")), "1")).toMatchObject({
			message: expect.stringContaining("written out"),
		});
	});
});
