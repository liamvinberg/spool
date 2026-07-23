import { describe, expect, it } from "vitest";
import { emptyHistory, entryOf, HISTORY_LIMIT, record, takeRedo, takeUndo } from "./history";

const rect = (x: number, y = 0, w = 100, h = 80) => ({ x, y, w, h });
const alive = (...names: string[]) => new Set(names);

describe("entryOf", () => {
	it("keeps only frames that actually moved", () => {
		const entry = entryOf({ a: rect(0), b: rect(50) }, { a: rect(10), b: rect(50) });
		expect(entry).toBeDefined();
		expect(Object.keys(entry?.rects ?? {})).toEqual(["a"]);
	});

	it("rounds both sides like the sidecar write", () => {
		const entry = entryOf({ a: { x: 10.4, y: 0.6, w: 100.2, h: 80 } }, { a: { x: 24.6, y: 0.6, w: 100.2, h: 80 } });
		expect(entry?.rects.a).toEqual({ before: rect(10, 1), after: rect(25, 1) });
	});

	it("is undefined when the gesture ends where it began", () => {
		expect(entryOf({ a: rect(10.4) }, { a: rect(10.4) })).toBeUndefined();
		expect(entryOf({}, {})).toBeUndefined();
	});
});

describe("record", () => {
	it("pushes the entry and voids redo", () => {
		let history = record(emptyHistory(), { rects: { a: { before: rect(0), after: rect(10) } } });
		const taken = takeUndo(history, alive("a"));
		history = record(taken?.history ?? history, { rects: { a: { before: rect(0), after: rect(30) } } });
		expect(history.undo).toHaveLength(1);
		expect(history.redo).toHaveLength(0);
	});

	it("caps the stack at HISTORY_LIMIT, oldest first", () => {
		let history = emptyHistory();
		for (let i = 0; i <= HISTORY_LIMIT + 4; i++) {
			history = record(history, { rects: { a: { before: rect(i), after: rect(i + 1) } } });
		}
		expect(history.undo).toHaveLength(HISTORY_LIMIT);
		expect(history.undo[0]?.rects.a?.before).toEqual(rect(5));
	});
});

describe("takeUndo and takeRedo", () => {
	it("round-trips: undo restores before, redo restores after", () => {
		const history = record(emptyHistory(), { rects: { a: { before: rect(0), after: rect(10) } } });
		const undone = takeUndo(history, alive("a"));
		expect(undone?.rects).toEqual({ a: rect(0) });
		expect(undone?.history.undo).toHaveLength(0);
		const redone = takeRedo(undone?.history ?? history, alive("a"));
		expect(redone?.rects).toEqual({ a: rect(10) });
		expect(redone?.history.undo).toHaveLength(1);
		expect(redone?.history.redo).toHaveLength(0);
	});

	it("skips an entry whose frames were all deleted and serves the older one", () => {
		let history = record(emptyHistory(), { rects: { a: { before: rect(0), after: rect(10) } } });
		history = record(history, { rects: { b: { before: rect(50), after: rect(60) } } });
		const taken = takeUndo(history, alive("a"));
		expect(taken?.rects).toEqual({ a: rect(0) });
		// the dead entry is gone for good — redo holds only what was applied
		expect(taken?.history.undo).toHaveLength(0);
		expect(taken?.history.redo).toHaveLength(1);
	});

	it("restores only the surviving frames of a mixed entry", () => {
		const history = record(emptyHistory(), {
			rects: {
				a: { before: rect(0), after: rect(10) },
				b: { before: rect(50), after: rect(60) },
			},
		});
		const taken = takeUndo(history, alive("a"));
		expect(taken?.rects).toEqual({ a: rect(0) });
		expect(taken?.history.redo[0]?.rects).toEqual({ a: { before: rect(0), after: rect(10) } });
	});

	it("is undefined on an empty stack", () => {
		expect(takeUndo(emptyHistory(), alive("a"))).toBeUndefined();
		expect(takeRedo(emptyHistory(), alive("a"))).toBeUndefined();
	});
});
