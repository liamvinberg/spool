import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readRegistry } from "../../registry";
import { makeTempDir } from "../../test-helpers";
import { importIntoNewProject, importPrompt, readImports } from "./imports";

const fig = () => new Uint8Array(readFileSync(join(import.meta.dirname, "../../fixtures/import/reading-list.fig")));

it("makes a dropped .fig a project named after the file, its every page and frame outlined beside design/", () => {
	const spool = makeTempDir();
	const location = makeTempDir();
	const made = importIntoNewProject(fig(), "Reading list.fig", location, spool);
	expect(made.name).toBe("Reading list");
	expect(readRegistry(spool).projects.map((project) => project.root)).toContain(made.root);
	expect(existsSync(join(made.root, "design", "canvas.json"))).toBe(true);
	const folder = join(made.root, "imports", "reading-list");
	expect(made.import).toMatchObject({ slug: "reading-list", source: "Figma", frames: 3, links: 1, sent: false });
	expect(made.import.pages.map((page) => [page.name, page.frames.map((frame) => frame.name)])).toEqual([
		["Page 1", ["Button", "Reading list"]],
		["Confirmations", ["Saved"]],
	]);
	// an instance is drawn out of its component with its own words, and its link crosses pages by the frame's name
	const reading = readFileSync(join(folder, "page-1", "reading-list.txt"), "utf8");
	expect(reading).toContain('instance of "Button"  256×59  stretch  row  gap 10  pad 20 16');
	expect(reading).toContain('→ "Saved" (click)');
	expect(reading).toContain('text "Keep reading"  100×19  Inter Regular 16  #ffffff');
	// the picture is a file the outline names
	const picture = reading.match(/image (images\/\w+\.png)/u)?.[1];
	expect(picture && existsSync(join(folder, picture))).toBe(true);
	expect(readFileSync(join(folder, "README.md"), "utf8")).toContain(
		'- "Reading list" 320×145: page-1/reading-list.txt, links to "Saved"',
	);
	// a second drop of the same file is a second project, never written over the first
	expect(importIntoNewProject(fig(), "Reading list.fig", location, spool).name).toBe("Reading list 2");
});

it("refuses a file that isn't Figma's, leaving nothing behind", () => {
	const spool = makeTempDir();
	const location = makeTempDir();
	expect(() => importIntoNewProject(new Uint8Array([1, 2, 3]), "notes.fig", location, spool)).toThrow(
		"This is not a Figma file. In Figma, use File → Save local copy.",
	);
	expect(readdirSync(location)).toEqual([]);
	expect(readRegistry(spool).projects).toEqual([]);
});

it("tells the agent where the import is once, then lists it as sent", () => {
	const made = importIntoNewProject(fig(), "Reading list.fig", makeTempDir(), makeTempDir());
	expect(importPrompt(made.root, "reading-list")).toBe(
		"<import>\nReading list, from Figma: imports/reading-list/ (beside design/), 2 pages, 3 frames, 1 prototype link. Read its README.md, then run `spool skill import` before writing a frame.\n</import>",
	);
	expect(readImports(made.root).map((one) => one.sent)).toEqual([true]);
	expect(importPrompt(made.root, "elsewhere")).toBeUndefined();
});
