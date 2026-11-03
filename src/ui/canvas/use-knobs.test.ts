import { expect, it } from "vitest";
import type { KnobPath, KnobValue } from "../../runtime/knob-protocol";
import { emptyHistory } from "./history";
import { knobId } from "./knobs";
import { createKnobLane } from "./use-knobs";

/** The knobs' lane (#220): a knob's writes go to the file one after another, in the order they were released. */

it("writes a knob's second release only once its first has landed", async () => {
	const at = "frames/card/frame.tsx:4:11";
	const asked: { value: KnobValue; answer: (written: undefined) => void }[] = [];
	const lane = createKnobLane(() => ({
		project: "p",
		post: () => {},
		writeKnob: (_project, _frame, ask) => new Promise((answer) => asked.push({ value: ask.value, answer })),
		landed: () => {},
		holdNext: { current: new Set() },
		history: { current: emptyHistory() },
		updateHistory: () => {},
		recordEntry: () => {},
		setNotice: () => {},
	}));
	const spec = { type: "slider", value: 20, min: 0, max: 40 } as const;
	lane.heard({ spool: "knobs", frame: "card", calls: [{ at, computed: [], schema: { radius: spec } }] });
	const path: KnobPath = "radius";
	const knob = {
		kind: "knob",
		id: knobId(at, path),
		at,
		path,
		key: path,
		depth: 0,
		spec,
		computed: false,
		shared: null,
	} as const;

	lane.tune("card", knob, 24, "commit");
	lane.tune("card", knob, 28, "commit");
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(asked.map((one) => one.value)).toEqual([24]);

	asked[0]?.answer(undefined);
	await expect.poll(() => asked.map((one) => one.value)).toEqual([24, 28]);
	lane.dispose();
});
