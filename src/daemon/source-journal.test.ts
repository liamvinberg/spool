import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { writeAtomic } from "../atomic-write";
import { makeTempDir } from "../test-helpers";
import { readInput } from "./retained-compile";
import { createSourceJournal } from "./source-journal";

it("retires history beyond the bounded operation journal without reviving on equal bytes", () => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, "0 untouched");
	const journal = createSourceJournal();
	const original = journal.observe(file);
	let before = original;
	for (let index = 0; index < 1025; index++) {
		const next = `${(index + 1) % 2} untouched`;
		writeAtomic(file, next);
		const after = readInput(file);
		journal.record(file, before, after, [
			{ start: 0, end: 1, before: before.bytes.toString("utf8").slice(0, 1), text: next.slice(0, 1) },
		]);
		before = after;
	}
	expect(() => journal.transform(file, original, [{ start: 2, end: 11, text: "hand" }])).toThrow("record was lost");
});
it("does not claim to detect an outside writer between its final observation and replacement", () => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, "original");
	const journal = createSourceJournal();
	const original = journal.observe(file);
	expect(journal.current(file, original).bytes.toString()).toBe("original");
	// An ordinary writer can land after the last check. There is no workspace lock.
	writeFileSync(file, "outside after final check");
	writeAtomic(file, "hand");
	journal.record(file, original, readInput(file), [{ start: 0, end: 8, before: "original", text: "hand" }]);
	expect(journal.observe(file).bytes.toString()).toBe("hand");
});
