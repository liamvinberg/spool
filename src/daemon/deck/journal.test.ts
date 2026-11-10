import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../../test-helpers";
import { writeDesignFile } from "./disk";
import { commitSteps, recoverDeckChanges } from "./journal";

/** A design/ with two frames' folders, each holding its notes. */
function fixture() {
	const designDir = join(makeTempDir(), "design");
	for (const folder of ["x", "s"]) mkdirSync(join(designDir, "frames", "talk", folder), { recursive: true });
	writeFileSync(join(designDir, "canvas.json"), "{}\n");
	writeFileSync(join(designDir, "frames/talk/x/notes.md"), "WORDS OF X\n");
	writeFileSync(join(designDir, "frames/talk/s/notes.md"), "WORDS OF S\n");
	writeFileSync(join(designDir, "frames/talk/deck.json"), '{ "slides": ["s"] }\n');
	const read = (path: string) =>
		existsSync(join(designDir, path)) ? readFileSync(join(designDir, path), "utf8") : null;
	const records = () => {
		const dir = join(designDir, ".spool", "deck-changes");
		return existsSync(dir) ? readdirSync(dir) : [];
	};
	const readOnly = (path: string) => {
		chmodSync(join(designDir, path), 0o555);
		onTestFinished(() => chmodSync(join(designDir, path), 0o755));
	};
	const trade = [
		{ path: "frames/talk/x/notes.md", before: "WORDS OF X\n", after: "WORDS OF S\n" },
		{ path: "frames/talk/s/notes.md", before: "WORDS OF S\n", after: "WORDS OF X\n" },
		{ path: "frames/talk/deck.json", before: '{ "slides": ["s"] }\n', after: '{ "slides": ["x"] }\n' },
	];
	return { designDir, read, records, readOnly, trade };
}

// a folder made read-only refuses its owner only when that owner is not root
describe.skipIf(process.getuid?.() === 0)("a deck change written as one transaction", () => {
	it("puts back what landed when a later write fails, keeps no record, and lands whole on a retry", () => {
		for (const failing of ["frames/talk/s", "frames/talk"]) {
			const disk = fixture();
			disk.readOnly(failing);
			expect(() => commitSteps(disk.designDir, "talk", disk.trade)).toThrow();
			expect(disk.read("frames/talk/x/notes.md")).toBe("WORDS OF X\n");
			expect(disk.read("frames/talk/s/notes.md")).toBe("WORDS OF S\n");
			expect(disk.read("frames/talk/deck.json")).toBe('{ "slides": ["s"] }\n');
			expect(disk.records()).toEqual([]);
			chmodSync(join(disk.designDir, failing), 0o755);
			commitSteps(disk.designDir, "talk", disk.trade);
			expect(disk.read("frames/talk/x/notes.md")).toBe("WORDS OF S\n");
			expect(disk.read("frames/talk/deck.json")).toBe('{ "slides": ["x"] }\n');
			expect(disk.records()).toEqual([]);
		}
	});
});

describe("a deck change the daemon died inside", () => {
	it("is put back where its files still hold what it found or wrote, and kept where a hand wrote since", () => {
		const disk = fixture();
		// died after the notes traded and before deck.json: as a crash leaves it
		writeFileSync(join(disk.designDir, "frames/talk/x/notes.md"), "WORDS OF S\n");
		writeFileSync(join(disk.designDir, "frames/talk/s/notes.md"), "WORDS OF X\n");
		mkdirSync(join(disk.designDir, ".spool", "deck-changes"), { recursive: true });
		const record = JSON.stringify({ page: "talk", steps: disk.trade });
		writeFileSync(join(disk.designDir, ".spool/deck-changes/one.json"), record);
		expect(recoverDeckChanges(disk.designDir)).toEqual([]);
		expect(disk.read("frames/talk/x/notes.md")).toBe("WORDS OF X\n");
		expect(disk.read("frames/talk/s/notes.md")).toBe("WORDS OF S\n");
		expect(disk.records()).toEqual([]);

		// the same, but a hand has written x's notes since: those words stand, the rest goes back, the record stays
		writeFileSync(join(disk.designDir, "frames/talk/x/notes.md"), "NEW WORDS\n");
		writeFileSync(join(disk.designDir, "frames/talk/s/notes.md"), "WORDS OF X\n");
		writeFileSync(join(disk.designDir, ".spool/deck-changes/two.json"), record);
		expect(recoverDeckChanges(disk.designDir)).toEqual(["talk"]);
		expect(disk.read("frames/talk/x/notes.md")).toBe("NEW WORDS\n");
		expect(disk.read("frames/talk/s/notes.md")).toBe("WORDS OF S\n");
		expect(disk.records()).toEqual(["two.json"]);
	});

	it("never makes a folder that went", () => {
		const disk = fixture();
		expect(() => writeDesignFile(disk.designDir, "frames/talk/gone/frame.json", "{}")).toThrow(/ENOENT/);
		mkdirSync(join(disk.designDir, ".spool", "deck-changes"), { recursive: true });
		writeFileSync(
			join(disk.designDir, ".spool/deck-changes/one.json"),
			JSON.stringify({
				page: "talk",
				steps: [{ path: "frames/talk/gone/notes.md", before: "WORDS\n", after: null }],
			}),
		);
		expect(recoverDeckChanges(disk.designDir)).toEqual([]);
		expect(existsSync(join(disk.designDir, "frames/talk/gone"))).toBe(false);
	});
});
