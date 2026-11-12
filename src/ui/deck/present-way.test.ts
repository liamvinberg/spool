import { expect, it } from "vitest";
import { presentPlan } from "./present-way";

it("plays the way taken last on one display, and a way picked becomes the one Present takes", () => {
	// Present, ⌘↵: the way remembered, full screen the first time; nothing to remember
	expect(presentPlan({ displays: 1, remembered: "slides", how: "present" })).toEqual({ way: "slides", room: false });
	expect(presentPlan({ displays: 1, remembered: "presenter", how: "present" })).toEqual({
		way: "presenter",
		room: true,
	});
	// ⌥⌘↵ takes the other way, and from now on Present does
	expect(presentPlan({ displays: 1, remembered: "slides", how: "other" })).toEqual({
		way: "presenter",
		room: true,
		remember: "presenter",
	});
	// a row of the caret's menu: that way, remembered unless it is already the one
	expect(presentPlan({ displays: 1, remembered: "presenter", how: { picked: "slides" } })).toEqual({
		way: "slides",
		room: false,
		remember: "slides",
	});
	expect(presentPlan({ displays: 1, remembered: "slides", how: { picked: "slides" } })).toEqual({
		way: "slides",
		room: false,
	});
});

it("plays the presenter view by itself on two displays, and the caret's full screen there once, with the room", () => {
	for (const remembered of ["slides", "presenter"] as const) {
		expect(presentPlan({ displays: 2, remembered, how: "present" })).toEqual({ way: "presenter", room: true });
		expect(presentPlan({ displays: 2, remembered, how: "other" })).toEqual({ way: "slides", room: true });
		expect(presentPlan({ displays: 2, remembered, how: { picked: "slides" } })).toEqual({
			way: "slides",
			room: true,
		});
	}
});
