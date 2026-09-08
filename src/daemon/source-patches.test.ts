import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { writeAtomic } from "../atomic-write";
import { makeTempDir } from "../test-helpers";
import { readInput } from "./retained-compile";
import { createSourceJournal } from "./source-journal";
import { applySourcePatches } from "./source-patches";

it("inverts disjoint replacements through an independent recorded edit between them", () => {
	const file = join(makeTempDir(), "source.tsx");
	const source = 'const classes = "text-sm z-0 text-red-500";';
	writeFileSync(file, source);
	const journal = createSourceJournal();
	const original = journal.observe(file);
	const patches = [
		{ start: source.indexOf("text-sm"), end: source.indexOf("text-sm") + 7, text: "text-[1.3rem]" },
		{ start: source.indexOf("text-red-500"), end: source.indexOf("text-red-500") + 12, text: "text-blue-500" },
	];
	const forward = applySourcePatches(source, patches);
	writeAtomic(file, forward.text);
	const saved = readInput(file);
	const operation = journal.record(
		file,
		original,
		saved,
		patches.map((patch) => ({ ...patch, before: source.slice(patch.start, patch.end) })),
	);
	const independent = { start: forward.text.indexOf("z-0"), end: forward.text.indexOf("z-0") + 3, text: "z-[123]" };
	const current = applySourcePatches(forward.text, [independent]).text;
	writeAtomic(file, current);
	const edited = readInput(file);
	journal.record(file, saved, edited, [{ ...independent, before: "z-0" }]);
	const inverse = journal.transform(file, saved, forward.inverse);
	const undone = applySourcePatches(current, inverse);
	expect(undone.text).toBe(source.replace("z-0", "z-[123]"));
	writeAtomic(file, undone.text);
	journal.record(
		file,
		edited,
		readInput(file),
		inverse.map((patch) => ({ ...patch, before: current.slice(patch.start, patch.end) })),
		operation,
	);
	const next = journal.transform(file, original, patches);
	expect(applySourcePatches(undone.text, next).text).toBe(current);
});

it("restores insertions and removals using their positions in the saved source", () => {
	const source = "before middle after";
	const saved = applySourcePatches(source, [
		{ start: 0, end: 6, text: "" },
		{ start: source.length, end: source.length, text: " added" },
	]);
	expect(saved.text).toBe(" middle after added");
	expect(applySourcePatches(saved.text, saved.inverse).text).toBe(source);
});

it("refuses ambiguous or invalid spans before producing a replacement", () => {
	for (const patches of [
		[{ start: -1, end: 1, text: "x" }],
		[{ start: 0, end: 6, text: "x" }],
		[{ start: 2, end: 1, text: "x" }],
		[{ start: 0.5, end: 1, text: "x" }],
		[
			{ start: 0, end: 2, text: "x" },
			{ start: 1, end: 3, text: "y" },
		],
		[
			{ start: 1, end: 1, text: "x" },
			{ start: 1, end: 1, text: "y" },
		],
	])
		expect(() => applySourcePatches("abcd", patches)).toThrow();
});
