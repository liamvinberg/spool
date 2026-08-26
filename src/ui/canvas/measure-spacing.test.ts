import { describe, expect, it } from "vitest";
import { decompose, measuredTarget } from "./measure-spacing";
import type { MeasuredBox, MeasuredParent, SpacingReading } from "./protocol";

/**
 * The measurement overlay's arithmetic (#261).
 *
 * Every rule the ticket names is here as a case: the gap on the parent, the
 * `space-y-*` that also resolves to the parent, the margins on whoever carries
 * them, and the leftover that is called residual rather than pinned on a class
 * that did not cause it. The frame does the reading; this is all the deciding,
 * so this is where the whole table gets covered.
 */

/** A box as a case writes one: everything optional, and margins side by side. */
type Sketch = Omit<Partial<MeasuredBox>, "margins"> & { margins?: Partial<MeasuredBox["margins"]> };

const box = (over: Sketch & { x: number; y: number; w: number; h: number }): MeasuredBox => ({
	selector: over.selector ?? "div",
	tag: over.tag ?? "div",
	className: over.className ?? "",
	rect: { x: over.x, y: over.y, w: over.w, h: over.h },
	radius: 0,
	margins: { top: 0, right: 0, bottom: 0, left: 0, ...over.margins },
	rtl: over.rtl ?? false,
	display: over.display ?? "block",
	loose: over.loose ?? false,
});

const parentOf = (over: Partial<MeasuredParent> = {}): MeasuredParent => ({
	selector: "ul",
	tag: "ul",
	className: "",
	display: "flex",
	gapX: 0,
	gapY: 0,
	...over,
});

/** Two boxes side by side on the x axis, `distance` apart. */
function across(distance: number, first: Sketch, second: Sketch, parent: MeasuredParent, step = 4): SpacingReading {
	return {
		axis: "x",
		from: 100,
		to: 100 + distance,
		at: 40,
		first: box({ x: 0, y: 0, w: 100, h: 80, selector: "a", tag: "a", ...first }),
		second: box({ x: 100 + distance, y: 0, w: 100, h: 80, selector: "b", tag: "b", ...second }),
		parent,
		step,
		root: 16,
	};
}

/** Two boxes stacked on the y axis, `distance` apart. */
function down(distance: number, first: Sketch, second: Sketch, parent: MeasuredParent, step = 4): SpacingReading {
	return {
		axis: "y",
		from: 50,
		to: 50 + distance,
		at: 60,
		first: box({ x: 0, y: 0, w: 120, h: 50, selector: "p:nth-of-type(1)", tag: "p", ...first }),
		second: box({ x: 0, y: 50 + distance, w: 120, h: 50, selector: "p:nth-of-type(2)", tag: "p", ...second }),
		parent,
		step,
		root: 16,
	};
}

describe("the gap belongs to the parent", () => {
	it("names it there, and nothing is left over", () => {
		const spacing = decompose(across(16, {}, {}, parentOf({ className: "flex gap-4", gapX: 16 })));
		expect(spacing.distance).toBe(16);
		expect(spacing.parts).toEqual([
			{ kind: "gap", px: 16, token: "gap-4", owner: { selector: "ul", tag: "ul", parent: true } },
		]);
	});

	it("takes the axis-specific token over the shorthand", () => {
		const spacing = decompose(
			across(24, {}, {}, parentOf({ className: "flex gap-y-4 gap-x-6", gapX: 24, gapY: 16 })),
		);
		expect(spacing.parts).toEqual([
			{ kind: "gap", px: 24, token: "gap-x-6", owner: { selector: "ul", tag: "ul", parent: true } },
		]);
	});

	it("reads the shorthand for either axis", () => {
		const stacked = decompose(down(16, {}, {}, parentOf({ className: "flex flex-col gap-4", gapX: 16, gapY: 16 })));
		expect(stacked.parts[0]).toMatchObject({ kind: "gap", token: "gap-4" });
	});

	it("ignores a gap on a parent whose layout does not honour one", () => {
		// `gap-4` on a block element computes a column-gap that nothing uses, so
		// naming it would send someone to edit a class that changes nothing
		const spacing = decompose(across(16, {}, {}, parentOf({ display: "block", className: "gap-4", gapX: 16 })));
		expect(spacing.parts).toEqual([{ kind: "residual", px: 16 }]);
	});

	it("shows a gap no class produced rather than attributing one", () => {
		const spacing = decompose(across(16, {}, {}, parentOf({ className: "flex", gapX: 16 })));
		expect(spacing.parts).toEqual([
			{ kind: "gap", px: 16, unclassed: true, owner: { selector: "ul", tag: "ul", parent: true } },
		]);
	});
});

describe("margins belong to whoever carries them", () => {
	it("names each one on its own element, beside the parent's gap", () => {
		const spacing = decompose(
			across(
				28,
				{ className: "mr-2", margins: { right: 8 } },
				{ className: "ml-1", margins: { left: 4 } },
				parentOf({ className: "flex gap-4", gapX: 16 }),
			),
		);
		expect(spacing.parts).toEqual([
			{ kind: "gap", px: 16, token: "gap-4", owner: { selector: "ul", tag: "ul", parent: true } },
			{ kind: "margin", px: 8, token: "mr-2", owner: { selector: "a", tag: "a" } },
			{ kind: "margin", px: 4, token: "ml-1", owner: { selector: "b", tag: "b" } },
		]);
	});

	it("takes the side token over the axis and the shorthand", () => {
		const spacing = decompose(
			across(24, { className: "m-2 mr-6", margins: { right: 24 } }, {}, parentOf({ className: "flex" })),
		);
		expect(spacing.parts).toEqual([{ kind: "margin", px: 24, token: "mr-6", owner: { selector: "a", tag: "a" } }]);
	});

	it("reads the shorthand when it is the only thing that could have said it", () => {
		const spacing = decompose(
			across(8, { className: "mx-2", margins: { right: 8 } }, {}, parentOf({ className: "flex" })),
		);
		expect(spacing.parts[0]).toMatchObject({ token: "mx-2" });
	});

	it("resolves a logical spelling through the element's own direction", () => {
		const ltr = decompose(
			across(16, { className: "me-4", margins: { right: 16 } }, {}, parentOf({ className: "flex" })),
		);
		expect(ltr.parts[0]).toMatchObject({ token: "me-4" });
		const rtl = decompose(
			across(16, { className: "ms-4", rtl: true, margins: { right: 16 } }, {}, parentOf({ className: "flex" })),
		);
		expect(rtl.parts[0]).toMatchObject({ token: "ms-4" });
	});

	it("reads a negative margin as the sign it carries", () => {
		const spacing = decompose(
			across(8, { className: "-mr-2", margins: { right: -8 } }, {}, parentOf({ className: "flex gap-4", gapX: 16 })),
		);
		expect(spacing.parts).toEqual([
			{ kind: "gap", px: 16, token: "gap-4", owner: { selector: "ul", tag: "ul", parent: true } },
			{ kind: "margin", px: -8, token: "-mr-2", owner: { selector: "a", tag: "a" } },
		]);
	});
});

describe("a space-* on the parent is the parent's", () => {
	it("names the child's margin on the class that wrote it", () => {
		const spacing = decompose(
			down(
				24,
				{ margins: { bottom: 24 } },
				{},
				parentOf({ display: "block", selector: "section", tag: "section", className: "space-y-6" }),
			),
		);
		expect(spacing.parts).toEqual([
			{ kind: "margin", px: 24, token: "space-y-6", owner: { selector: "section", tag: "section", parent: true } },
		]);
	});

	it("prefers the element's own token when it has one", () => {
		const spacing = decompose(
			down(
				24,
				{ className: "mb-6", margins: { bottom: 24 } },
				{},
				parentOf({ display: "block", className: "space-y-6" }),
			),
		);
		expect(spacing.parts[0]).toMatchObject({ token: "mb-6", owner: { tag: "p" } });
	});
});

describe("what is left over is residual", () => {
	it("carries the difference and names nothing", () => {
		const spacing = decompose(across(20, {}, {}, parentOf({ className: "flex gap-4", gapX: 16 })));
		expect(spacing.parts).toEqual([
			{ kind: "gap", px: 16, token: "gap-4", owner: { selector: "ul", tag: "ul", parent: true } },
			{ kind: "residual", px: 4 },
		]);
	});

	it("stays off when the parts already account for the distance", () => {
		const spacing = decompose(across(16, {}, {}, parentOf({ className: "flex gap-4", gapX: 16 })));
		expect(spacing.parts.some((part) => part.kind === "residual")).toBe(false);
	});

	it("is what a touching pair reports, so the overlay always says something", () => {
		const spacing = decompose(across(0, {}, {}, parentOf({ className: "flex" })));
		expect(spacing.parts).toEqual([{ kind: "residual", px: 0 }]);
	});
});

describe("adjoining block margins collapse", () => {
	it("counts the larger and lists the other as collapsed", () => {
		const spacing = decompose(
			down(
				24,
				{ className: "mb-6", margins: { bottom: 24 } },
				{ className: "mt-2", margins: { top: 8 } },
				parentOf({ display: "block", className: "" }),
			),
		);
		expect(spacing.parts).toEqual([
			{ kind: "margin", px: 24, token: "mb-6", owner: { selector: "p:nth-of-type(1)", tag: "p" } },
			{ kind: "margin", px: 8, token: "mt-2", owner: { selector: "p:nth-of-type(2)", tag: "p" }, collapsed: true },
		]);
	});

	it("does not collapse them in a flex column, where both count", () => {
		const spacing = decompose(
			down(
				32,
				{ className: "mb-6", margins: { bottom: 24 } },
				{ className: "mt-2", margins: { top: 8 } },
				parentOf({ display: "flex", className: "flex flex-col" }),
			),
		);
		expect(spacing.parts.map((part) => part.px)).toEqual([24, 8]);
		expect(spacing.parts.some((part) => part.collapsed === true)).toBe(false);
	});

	it("does not collapse them across the inline axis", () => {
		const spacing = decompose(
			across(
				32,
				{ className: "mr-6", margins: { right: 24 } },
				{ className: "ml-2", margins: { left: 8 } },
				parentOf({ display: "block", className: "" }),
			),
		);
		expect(spacing.parts.some((part) => part.collapsed === true)).toBe(false);
	});

	it("does not collapse against an element taken out of flow", () => {
		const spacing = decompose(
			down(
				32,
				{ className: "mb-6", margins: { bottom: 24 } },
				{ className: "mt-2", loose: true, margins: { top: 8 } },
				parentOf({ display: "block", className: "" }),
			),
		);
		expect(spacing.parts.some((part) => part.collapsed === true)).toBe(false);
	});

	it("does not collapse against an inline-block or a table", () => {
		for (const display of ["inline-block", "table"]) {
			const spacing = decompose(
				down(
					32,
					{ className: "mb-6", margins: { bottom: 24 } },
					{ className: "mt-2", display, margins: { top: 8 } },
					parentOf({ display: "block", className: "" }),
				),
			);
			expect(spacing.parts.map((part) => part.px)).toEqual([24, 8]);
		}
	});

	it("counts no block margin on a bare inline box, which lays none out", () => {
		const spacing = decompose(
			down(
				24,
				{ className: "mb-6", display: "inline", margins: { bottom: 24 } },
				{},
				parentOf({ display: "block", className: "" }),
			),
		);
		expect(spacing.parts).toEqual([{ kind: "residual", px: 24 }]);
	});

	it("still counts an inline box's inline margins, which it does lay out", () => {
		const spacing = decompose(
			across(
				8,
				{ className: "mr-2", display: "inline", margins: { right: 8 } },
				{},
				parentOf({ display: "block", className: "" }),
			),
		);
		expect(spacing.parts[0]).toMatchObject({ token: "mr-2" });
	});
});

describe("the token is resolved against what the project says a step is", () => {
	it("reads the scale off the frame rather than assuming a quarter rem", () => {
		const spacing = decompose(across(32, {}, {}, parentOf({ className: "flex gap-4", gapX: 32 }), 8));
		expect(spacing.parts[0]).toMatchObject({ token: "gap-4" });
	});

	it("takes a half step, which the pinned Tailwind compiles", () => {
		const spacing = decompose(across(18, {}, {}, parentOf({ className: "flex gap-4.5", gapX: 18 })));
		expect(spacing.parts[0]).toMatchObject({ token: "gap-4.5" });
	});

	it("reads an arbitrary value in px and in rem", () => {
		const pixels = decompose(across(15, {}, {}, parentOf({ className: "flex gap-[15px]", gapX: 15 })));
		expect(pixels.parts[0]).toMatchObject({ token: "gap-[15px]" });
		const rems = decompose(across(16, {}, {}, parentOf({ className: "flex gap-[1rem]", gapX: 16 })));
		expect(rems.parts[0]).toMatchObject({ token: "gap-[1rem]" });
	});

	it("reads the one-pixel token", () => {
		const spacing = decompose(
			across(1, { className: "mr-px", margins: { right: 1 } }, {}, parentOf({ className: "flex" })),
		);
		expect(spacing.parts[0]).toMatchObject({ token: "mr-px" });
	});

	it("names nothing for a value it cannot resolve", () => {
		const spacing = decompose(across(16, {}, {}, parentOf({ className: "flex gap-[2em]", gapX: 16 })));
		expect(spacing.parts[0]).toMatchObject({ unclassed: true });
	});
});

describe("the live token is the one named", () => {
	it("prefers the bare token to a variant worth the same", () => {
		const spacing = decompose(
			across(16, { className: "mr-4 md:mr-4", margins: { right: 16 } }, {}, parentOf({ className: "flex" })),
		);
		expect(spacing.parts[0]).toMatchObject({ token: "mr-4" });
	});

	it("names the variant when the variant is what the pixels say", () => {
		const spacing = decompose(
			across(32, { className: "mr-4 md:mr-8", margins: { right: 32 } }, {}, parentOf({ className: "flex" })),
		);
		expect(spacing.parts[0]).toMatchObject({ token: "md:mr-8" });
	});

	it("survives a token marked important", () => {
		const spacing = decompose(
			across(16, { className: "mr-4!", margins: { right: 16 } }, {}, parentOf({ className: "flex" })),
		);
		expect(spacing.parts[0]).toMatchObject({ token: "mr-4!" });
	});
});

it("names the box the pointer found, whichever end of the pair it is", () => {
	const reading = across(16, {}, {}, parentOf({ className: "flex" }));
	expect(measuredTarget(reading, "a").selector).toBe("b");
	expect(measuredTarget(reading, "b").selector).toBe("a");
});
