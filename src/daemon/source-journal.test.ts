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

it("exposes acknowledged transient snapshots and only marks explicit inverse pairs canceled", () => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, "base");
	const journal = createSourceJournal();
	const original = journal.observe(file);
	const save = (text: string, inverseOf?: symbol) => {
		const before = journal.observe(file);
		writeAtomic(file, text);
		return journal.record(
			file,
			before,
			readInput(file),
			[{ start: 0, end: before.bytes.length, before: before.bytes.toString(), text }],
			inverseOf,
		);
	};
	save("competing");
	save("base");
	const hand = save("hand");
	save("base", hand);
	expect(
		journal
			.changes(file, original)
			.map((change) => [change.before.bytes.toString(), change.after.bytes.toString(), change.canceled]),
	).toEqual([
		["base", "competing", false],
		["competing", "base", false],
		["base", "hand", true],
		["hand", "base", true],
	]);
	writeFileSync(file, "opaque");
	expect(() => journal.changes(file, original)).toThrow("record was lost");
});

it("orders acknowledged changes across separate dependency files", () => {
	const dir = makeTempDir();
	const first = join(dir, "first.ts");
	const second = join(dir, "second.ts");
	writeFileSync(first, "a");
	writeFileSync(second, "b");
	const journal = createSourceJournal();
	const a = journal.observe(first);
	const b = journal.observe(second);
	writeAtomic(second, "B");
	journal.record(second, b, readInput(second), [{ start: 0, end: 1, before: "b", text: "B" }]);
	writeAtomic(first, "A");
	journal.record(first, a, readInput(first), [{ start: 0, end: 1, before: "a", text: "A" }]);
	const ordered = [...journal.changes(first, a), ...journal.changes(second, b)].sort(
		(left, right) => left.order - right.order,
	);
	expect(ordered.map((change) => change.after.bytes.toString())).toEqual(["B", "A"]);
});

it.each([0, 1])("transports an inverse insertion at boundary %s through a canceled neighboring removal", (point) => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, "BC");
	const journal = createSourceJournal();
	const original = journal.observe(file);
	writeAtomic(file, "C");
	const removed = readInput(file);
	const deletion = journal.record(file, original, removed, [{ start: 0, end: 1, before: "B", text: "" }]);
	writeAtomic(file, "BC");
	journal.record(file, removed, readInput(file), [{ start: 0, end: 0, before: "", text: "B" }], deletion);
	expect(journal.transform(file, original, [{ start: point, end: point, text: "A" }])).toEqual([
		{ start: point, end: point, text: "A" },
	]);
});

it("keeps an agent insertion at the inverse boundary conflicting even beside a canceled owner pair", () => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, "BC");
	const journal = createSourceJournal();
	const original = journal.observe(file);
	writeAtomic(file, "C");
	const removed = readInput(file);
	const deletion = journal.record(file, original, removed, [{ start: 0, end: 1, before: "B", text: "" }]);
	writeAtomic(file, "XC");
	const competing = readInput(file);
	journal.record(file, removed, competing, [{ start: 0, end: 0, before: "", text: "X" }]);
	writeAtomic(file, "BXC");
	journal.record(file, competing, readInput(file), [{ start: 0, end: 0, before: "", text: "B" }], deletion);
	expect(() => journal.transform(file, original, [{ start: 0, end: 0, text: "A" }])).toThrow("touched these words");
});

it("transports an intact neighbor through a canceled insertion at its boundary", () => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, "BC");
	const journal = createSourceJournal();
	const original = journal.observe(file);
	writeAtomic(file, "ABC");
	const inserted = readInput(file);
	const insertion = journal.record(file, original, inserted, [{ start: 0, end: 0, before: "", text: "A" }]);
	writeAtomic(file, "BC");
	journal.record(file, inserted, readInput(file), [{ start: 0, end: 1, before: "A", text: "" }], insertion);
	expect(journal.transform(file, original, [{ start: 0, end: 1, text: "" }])).toEqual([
		{ start: 0, end: 1, text: "" },
	]);
});

it("preserves an independent prefix while transporting a privately canceled insertion boundary", () => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, "xx BC");
	const journal = createSourceJournal();
	const original = journal.observe(file);
	writeAtomic(file, "xx C");
	const removed = readInput(file);
	const deletion = journal.record(file, original, removed, [{ start: 3, end: 4, before: "B", text: "" }]);
	writeAtomic(file, "!xx C");
	const prefixed = readInput(file);
	journal.record(file, removed, prefixed, [{ start: 0, end: 0, before: "", text: "!" }]);
	writeAtomic(file, "!xx BC");
	journal.record(file, prefixed, readInput(file), [{ start: 4, end: 4, before: "", text: "B" }], deletion);
	expect(journal.transform(file, original, [{ start: 3, end: 3, text: "A" }])).toEqual([
		{ start: 4, end: 4, text: "A" },
	]);
});

it.each([
	{ prefix: false, middle: "none" },
	{ prefix: true, middle: "none" },
	{ prefix: true, middle: "nested" },
	{ prefix: false, middle: "competing" },
])("transports an enclosed inverse with prefix $prefix and $middle edits", ({ prefix, middle }) => {
	const file = join(makeTempDir(), "source.ts");
	writeFileSync(file, 'x className="opacity-25" y');
	const journal = createSourceJournal();
	const original = journal.observe(file);
	const span = 'className="opacity-25"';
	writeAtomic(file, "x  y");
	const removed = readInput(file);
	const deletion = journal.record(file, original, removed, [
		{ start: 2, end: 2 + span.length, before: span, text: "" },
	]);
	let current = removed;
	if (prefix) {
		writeAtomic(file, "!x  y");
		current = readInput(file);
		journal.record(file, removed, current, [{ start: 0, end: 0, before: "", text: "!" }]);
	}
	const shift = prefix ? 1 : 0;
	if (middle !== "none") {
		const empty = current;
		writeAtomic(file, `${prefix ? "!" : ""}x X y`);
		current = readInput(file);
		const insertion = journal.record(file, empty, current, [
			{ start: 2 + shift, end: 2 + shift, before: "", text: "X" },
		]);
		writeAtomic(file, `${prefix ? "!" : ""}x  y`);
		const restored = readInput(file);
		journal.record(
			file,
			current,
			restored,
			[{ start: 2 + shift, end: 3 + shift, before: "X", text: "" }],
			middle === "nested" ? insertion : undefined,
		);
		current = restored;
	}
	writeAtomic(file, `${prefix ? "!" : ""}x ${span} y`);
	journal.record(
		file,
		current,
		readInput(file),
		[{ start: 2 + shift, end: 2 + shift, before: "", text: span }],
		deletion,
	);
	const start = original.bytes.toString().indexOf("opacity-25");
	const transform = () => journal.transform(file, original, [{ start, end: start + 10, text: "opacity-50" }]);
	if (middle === "competing") {
		expect(transform).toThrow("touched these words");
		return;
	}
	expect(transform()).toEqual([{ start: start + shift, end: start + shift + 10, text: "opacity-50" }]);
});

it.each([true, false])("keeps an enclosing inverse across a paired interior edit: %s", (paired) => {
	const file = join(makeTempDir(), "source.ts");
	const span = 'className="opacity-25"';
	const source = `x ${span} y`;
	writeFileSync(file, source);
	const journal = createSourceJournal();
	const original = journal.observe(file);
	const start = source.indexOf("25");
	writeAtomic(file, source.replace("25", "100"));
	const changed = readInput(file);
	const edit = journal.record(file, original, changed, [{ start, end: start + 2, before: "25", text: "100" }]);
	writeAtomic(file, source);
	journal.record(
		file,
		changed,
		readInput(file),
		[{ start, end: start + 3, before: "100", text: "25" }],
		paired ? edit : undefined,
	);
	const inverse = [{ start: 2, end: 2 + span.length, text: "" }];
	if (paired) expect(journal.transform(file, original, inverse)).toEqual(inverse);
	else expect(() => journal.transform(file, original, inverse)).toThrow("touched these words");
});
