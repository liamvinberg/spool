import { expect, it } from "vitest";
import type { KnobCall, KnobSpec } from "../../runtime/knob-protocol";
import {
	knobId,
	knobLines,
	knobStatus,
	nudged,
	reachOf,
	readersOf,
	statusWords,
	stillLive,
	variantName,
} from "./knobs";

/**
 * The Knobs section as the rail reads a frame's calls (#220): rows and folding
 * groups in code order, the shared mark, how each type is reached, what a step
 * does, the status line's words, and which live values a new document has
 * caught up with.
 */

const OWN: KnobCall = {
	at: "frames/shop/card/frame.tsx:4:11",
	computed: ["card.badge"],
	schema: {
		card: {
			radius: { type: "corners", value: 20, min: 0, max: 40 },
			badge: { type: "toggle", value: true },
			inner: { gap: { type: "slider", value: 8, min: 0, max: 10, step: 0.5 } },
		},
		replay: { type: "action", label: "Replay" },
	},
};

const SHARED: KnobCall = {
	at: "shared/knobs/kaffe.ts:4:24",
	computed: [],
	schema: { accent: { type: "color", value: "#2f5d50" } },
};

it("lays a frame's calls out as rows under folding group heads, in code order", () => {
	const lines = knobLines("shop/card", [OWN, SHARED], new Set());
	expect(
		lines.map((line) => `${"  ".repeat(line.depth)}${line.kind === "group" ? `${line.key}/` : line.key}`),
	).toEqual(["card/", "  radius", "  badge", "  inner/", "    gap", "replay", "accent"]);
	const badge = lines.find((line) => line.kind === "knob" && line.key === "badge");
	expect(badge).toMatchObject({ computed: true, shared: null, path: "card.badge" });
	// a knob declared outside the frame's folder is marked, by the file it is in
	expect(lines.at(-1)).toMatchObject({ kind: "knob", shared: "shared/knobs/kaffe.ts" });

	// a folded group keeps its head and how many it holds, and hides everything under it
	const folded = knobLines("shop/card", [OWN], new Set([knobId(OWN.at, "card")]));
	expect(folded.map((line) => line.key)).toEqual(["card", "replay"]);
	expect(folded[0]).toMatchObject({ kind: "group", open: false, count: 3 });
});

it("opens a knob in place, beside its row for a long list, or acts where it stands", () => {
	expect(["corners", "color", "easing", "pictures"].map((type) => reachOf(type as never))).toEqual([
		"opens",
		"opens",
		"opens",
		"opens",
	]);
	expect(["font", "icon", "select"].map((type) => reachOf(type as never))).toEqual(["popover", "popover", "popover"]);
	expect(["toggle", "stepper", "segmented", "text", "action"].map((type) => reachOf(type as never))).toEqual([
		"row",
		"row",
		"row",
		"row",
		"row",
	]);
});

it("steps a knob by whole units: numbers clamp to their step, angles wrap, sides move together, choices walk", () => {
	expect(nudged({ type: "slider", value: 8, max: 10, step: 0.5 }, 9.5, 1)).toBe(10);
	expect(nudged({ type: "slider", value: 8, max: 10, step: 0.5 }, 9.5, 10)).toBe(10);
	expect(nudged({ type: "duration", value: 0.3 }, 0.3, 1)).toBe(0.31);
	expect(nudged({ type: "angle", value: 0 }, 359, 2)).toBe(1);
	expect(nudged({ type: "spacing", value: [20, 22], min: 0 }, [20, 0], -1)).toEqual([19, 0]);
	expect(nudged({ type: "toggle", value: false }, false, 1)).toBe(true);
	const pack: KnobSpec = { type: "segmented", value: "s", options: ["s", { value: "m" }, "l"] };
	expect(nudged(pack, "s", 1)).toBe("m");
	expect(nudged(pack, "l", 1)).toBe("l");
	expect(nudged({ type: "easing", value: [0.2, 0, 0, 1] }, [0.2, 0, 0, 1], 1)).toBeUndefined();
});

it("says what letting go will write while a hand is on a knob, then the file and line it wrote", () => {
	expect(statusWords(knobStatus("live", "shop/card", OWN.at, "card.radius", 18, 24))).toEqual({
		says: "frame.tsx:4 radius 18 → 24",
		aside: "esc puts back",
	});
	expect(statusWords(knobStatus("written", "shop/card", SHARED.at, "accent", "#2f5d50", "#c96a3c", 3))).toEqual({
		says: "shared/knobs/kaffe.ts:4 accent #2f5d50 → #c96a3c",
		aside: "3 frames",
	});
	expect(statusWords(knobStatus("undone", "shop/card", OWN.at, "card.inner.gap", [20, 22], [20, 24])).says).toBe(
		"undone frame.tsx:4 gap 20 22 → 20 24",
	);
});

it("keeps telling a document the values its literals have not caught up with", () => {
	const live = new Map([
		[OWN.at, { "card.radius": 20, "card.inner.gap": 6 }],
		["frames/shop/card/frame.tsx:30:9", { size: 4 }],
	]);
	// the written radius is the literal now; the gap is still the hand's; a call no longer run is nobody's
	expect(stillLive([OWN], live)).toEqual(new Map([[OWN.at, { "card.inner.gap": 6 }]]));
});

it("posts a shared knob to every frame whose document declared its call", () => {
	const declared = new Map([
		["shop/card", [OWN, SHARED]],
		["shop/cart", [SHARED]],
		["site/home", []],
	]);
	expect(readersOf(declared, SHARED.at)).toEqual(["shop/card", "shop/cart"]);
});

it("names a variant after its frame with the next letter free", () => {
	expect(variantName("product-card", new Set(["product-card"]))).toBe("product-card--b");
	expect(variantName("product-card--b", new Set(["product-card--b"]))).toBe("product-card--c");
});
