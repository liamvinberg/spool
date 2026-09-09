import { realpathSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { LENGTHS } from "../properties/families";
import { rowFor } from "../properties/rows";
import type { SourcePropertyEnvironment } from "../source-property";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { appearanceProperties } from "./fixtures/property-appearance";
import { readInput } from "./retained-compile";
import { planPropertyValue } from "./source-property-plan";

function fixture() {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{font-size:20px;--space:10px 20px}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	return { root, inputs: new Map([[file, readInput(file)]]) };
}
it.each(appearanceProperties)("plans retained $property from actual declaration owners", async (row) => {
	const f = fixture();
	const before = [row.before, row.companion, "z-10"].filter(Boolean).join(" ");
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const plan = await planPropertyValue(
		f.root,
		f.inputs,
		before,
		operation,
		{ kind: "binding", tokens: row.after.split(" ") },
		{ direction: "ltr", writingMode: "horizontal-tb" },
	);
	expect(new Set(plan.next.split(" ")), row.property).toEqual(
		new Set([row.after, row.companion, "z-10"].filter(Boolean).join(" ").split(" ")),
	);
	expect(plan.roots.size, row.property).toBeGreaterThan(0);
	const inverse = await planPropertyValue(
		f.root,
		f.inputs,
		plan.next,
		operation,
		{ kind: "binding", tokens: row.before.split(" ") },
		{ direction: "ltr", writingMode: "horizontal-tb" },
	);
	expect(new Set(inverse.next.split(" ")), row.property).toEqual(new Set(before.split(" ")));
});
it("keeps a size binding and independent filter inputs during focused component edits", async () => {
	const f = fixture();
	const env = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const leading = await planPropertyValue(
		f.root,
		f.inputs,
		"text-sm leading-normal marker",
		{ kind: "property", property: "line-height", scope: "" },
		{ kind: "binding", tokens: ["leading-loose"] },
		env,
	);
	expect(leading.before).toEqual(["leading-normal"]);
	expect(leading.next).toContain("text-sm");
	expect(leading.next).toContain("marker");
	const filters = await planPropertyValue(
		f.root,
		f.inputs,
		"brightness-75 grayscale",
		{ kind: "property", property: "filter", scope: "" },
		{ kind: "binding", tokens: ["invert"] },
		env,
	);
	expect(filters.before).toEqual(["grayscale"]);
	expect(filters.next).toBe("brightness-75 invert");
});

it.each([
	["border-2 z-10", "border-top-width", "border-t-4"],
	["rounded-lg", "border-top-left-radius", "rounded-tl-sm"],
	["scale-50", "scale-x", "scale-x-75"],
	// the layout folds: one side of a shorthand, one edge of an axis, one gap axis
	["p-4", "padding-left", "pl-2"],
	["px-4", "padding-inline-start", "ps-2"],
	["m-4", "margin-top", "mt-2"],
	["gap-4", "column-gap", "gap-x-2"],
	["inset-4", "top", "top-2"],
])("carries the broader binding when editing its component: %s", async (literal, property, token) => {
	const f = fixture();
	const plan = await planPropertyValue(
		f.root,
		f.inputs,
		literal,
		{ kind: "property", property, scope: "" },
		{ kind: "binding", tokens: [token] },
		{ direction: "ltr", writingMode: "horizontal-tb" },
	);
	expect(plan.before).toEqual([]);
	expect(plan.after).toEqual([token]);
	expect(plan.next).toBe(`${literal} ${token}`);
});

it("keeps native independent sides and axes when a component overrides its broader binding", async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage();
	const f = fixture();
	for (const row of [
		{
			literal: "border-2",
			property: "border-top-width",
			token: "border-t-4",
			changed: "border-top-width",
			kept: ["border-right-width", "border-bottom-width", "border-left-width", "border-right-style"],
		},
		{
			literal: "rounded-lg",
			property: "border-top-left-radius",
			token: "rounded-tl-sm",
			changed: "border-top-left-radius",
			kept: ["border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
		},
		{
			literal: "scale-50",
			property: "scale-x",
			token: "scale-x-75",
			changed: "--tw-scale-x",
			kept: ["--tw-scale-y", "--tw-scale-z"],
		},
	]) {
		await page.setContent('<div id="subject"></div>');
		const environment = await page.locator("#subject").evaluate((element): SourcePropertyEnvironment => {
			const style = getComputedStyle(element);
			if (style.direction !== "ltr" && style.direction !== "rtl") throw new Error("unknown direction");
			return { direction: style.direction, writingMode: style.writingMode };
		});
		const plan = await planPropertyValue(
			f.root,
			f.inputs,
			row.literal,
			{ kind: "property", property: row.property, scope: "" },
			{ kind: "binding", tokens: [row.token] },
			environment,
		);
		const observe = async (literal: string, css: string) =>
			page.evaluate(
				({ literal, css, keys }) => {
					document.querySelector("style")?.remove();
					const sheet = document.createElement("style");
					sheet.textContent = css;
					document.head.append(sheet);
					const subject = document.querySelector("#subject")!;
					subject.setAttribute("class", literal);
					const style = getComputedStyle(subject);
					return Object.fromEntries(keys.map((key) => [key, style.getPropertyValue(key)]));
				},
				{ literal, css, keys: [row.changed, ...row.kept] },
			);
		const before = await observe(row.literal, plan.original.css);
		const after = await observe(plan.next, plan.desired.css);
		expect(after[row.changed], row.property).not.toBe(before[row.changed]);
		for (const key of row.kept) expect(after[key], `${row.property}: ${key}`).toBe(before[key]);
	}
});

it("retains authored priority and the lower declaration revealed by removal", async () => {
	const f = fixture();
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: "color", scope: "hover:" } as const;
	const changed = await planPropertyValue(
		f.root,
		f.inputs,
		"hover:text-red-500 hover:text-blue-500! text-sm",
		operation,
		{ kind: "binding", tokens: ["hover:text-green-500"] },
		environment,
	);
	expect(changed.before).toEqual(["hover:text-blue-500!"]);
	expect(changed.after).toEqual(["hover:text-green-500!"]);
	expect(changed.next).toContain("hover:text-red-500");
	const removed = await planPropertyValue(f.root, f.inputs, changed.next, operation, { kind: "remove" }, environment);
	expect(removed.before).toEqual(["hover:text-green-500!"]);
	expect(removed.next).toBe("hover:text-red-500 text-sm");
});

// A gradient is several classes, and each one is its own source token: the
// controls send them apart, so a run of classes in one token is a malformed
// request rather than a class the compiler failed to emit.
it("refuses a binding token that is a run of classes", async () => {
	const f = fixture();
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: "background-image", scope: "" } as const;
	const literal = "bg-linear-to-r from-red-500 to-blue-500";
	await expect(
		planPropertyValue(
			f.root,
			f.inputs,
			literal,
			operation,
			{ kind: "binding", tokens: ["bg-linear-to-r from-green-500 to-blue-500"] },
			environment,
		),
	).rejects.toThrow("each binding token is one class");
	const planned = await planPropertyValue(
		f.root,
		f.inputs,
		literal,
		operation,
		{ kind: "binding", tokens: ["bg-linear-to-r", "from-green-500", "to-blue-500"] },
		environment,
	);
	expect(new Set(planned.next.split(" "))).toEqual(new Set(["bg-linear-to-r", "from-green-500", "to-blue-500"]));
});

/**
 * The retained layout inventory (#303): every row a Layout control can write.
 *
 * Each entry is the row's index in the shared inventory, the property the
 * control asks for, the token the file is written with, the token the control
 * requests, and whatever companion the compiler needs for the declaration to
 * exist at all. The sizing-mode menus ask under their own axis, so `w-auto` to
 * `w-full` is a width request rather than a request about a menu's name.
 */
const layoutProperties: readonly (readonly [number, string, string, string, string])[] = [
	[0, "top", "top-2", "top-4", ""],
	[1, "right", "right-2", "right-4", ""],
	[2, "bottom", "bottom-2", "bottom-4", ""],
	[3, "left", "left-2", "left-4", ""],
	[4, "inset", "inset-2", "inset-4", ""],
	[5, "inset-inline", "inset-x-2", "inset-x-4", ""],
	[6, "inset-block", "inset-y-2", "inset-y-4", ""],
	[7, "inset-inline-start", "start-2", "start-4", ""],
	[8, "inset-inline-end", "end-2", "end-4", ""],
	[9, "z-index", "z-2", "z-4", ""],
	[10, "width", "w-2", "w-4", ""],
	[11, "height", "h-2", "h-4", ""],
	[12, "width and height", "size-2", "size-4", ""],
	[13, "min-width", "min-w-2", "min-w-4", ""],
	[14, "max-width", "max-w-2", "max-w-4", ""],
	[15, "min-height", "min-h-2", "min-h-4", ""],
	[16, "max-height", "max-h-2", "max-h-4", ""],
	[17, "flex-basis", "basis-2", "basis-4", ""],
	[18, "padding", "p-2", "p-4", ""],
	[19, "padding-inline", "px-2", "px-4", ""],
	[20, "padding-block", "py-2", "py-4", ""],
	[21, "padding-top", "pt-2", "pt-4", ""],
	[22, "padding-right", "pr-2", "pr-4", ""],
	[23, "padding-bottom", "pb-2", "pb-4", ""],
	[24, "padding-left", "pl-2", "pl-4", ""],
	[25, "padding-inline-start", "ps-2", "ps-4", ""],
	[26, "padding-inline-end", "pe-2", "pe-4", ""],
	[27, "margin", "m-2", "m-4", ""],
	[28, "margin-inline", "mx-2", "mx-4", ""],
	[29, "margin-block", "my-2", "my-4", ""],
	[30, "margin-top", "mt-2", "mt-4", ""],
	[31, "margin-right", "mr-2", "mr-4", ""],
	[32, "margin-bottom", "mb-2", "mb-4", ""],
	[33, "margin-left", "ml-2", "ml-4", ""],
	[34, "margin-inline-start", "ms-2", "ms-4", ""],
	[35, "margin-inline-end", "me-2", "me-4", ""],
	[36, "gap", "gap-2", "gap-4", ""],
	[37, "column-gap", "gap-x-2", "gap-x-4", ""],
	[38, "row-gap", "gap-y-2", "gap-y-4", ""],
	[39, "column-gap, between children", "space-x-2", "space-x-4", ""],
	[40, "row-gap, between children", "space-y-2", "space-y-4", ""],
	[41, "grid-template-columns", "grid-cols-2", "grid-cols-4", ""],
	[42, "grid-template-rows", "grid-rows-2", "grid-rows-4", ""],
	[43, "grid-column", "col-span-2", "col-span-4", ""],
	[44, "grid-row", "row-span-2", "row-span-4", ""],
	[45, "grid-column-start", "col-start-2", "col-start-4", ""],
	[46, "grid-row-start", "row-start-2", "row-start-4", ""],
	[47, "columns", "columns-2", "columns-4", ""],
	[48, "order", "order-2", "order-4", ""],
	[86, "display", "flex", "grid", ""],
	[87, "flex-direction", "flex-row", "flex-col", ""],
	[88, "flex-wrap", "flex-wrap", "flex-nowrap", ""],
	[89, "align-items", "items-start", "items-center", ""],
	[90, "justify-content", "justify-start", "justify-center", ""],
	[91, "align-self", "self-auto", "self-start", ""],
	[92, "position", "static", "relative", ""],
	[93, "overflow", "overflow-visible", "overflow-hidden", ""],
	[94, "overflow-x", "overflow-x-visible", "overflow-x-hidden", ""],
	[95, "overflow-y", "overflow-y-visible", "overflow-y-hidden", ""],
	[102, "flex", "flex-1", "flex-auto", ""],
	[117, "border-color, between children", "divide-red-500", "divide-blue-500", "divide-x-2"],
	[139, "scroll-snap-type", "snap-none", "snap-x", ""],
	[141, "width", "w-auto", "w-full", ""],
	[142, "height", "h-auto", "h-full", ""],
];

it.each(layoutProperties)(
	"plans retained layout %i %s from actual declaration owners",
	async (_index, property, before, after, companion) => {
		const f = fixture();
		// a colour is nothing any layout declaration owns, so it proves the plan
		// leaves the rest of the literal exactly where it was
		const literal = [before, companion, "text-red-500"].filter(Boolean).join(" ");
		const operation = { kind: "property", property, scope: "" } as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const plan = await planPropertyValue(
			f.root,
			f.inputs,
			literal,
			operation,
			{
				kind: "binding",
				tokens: after.split(" "),
			},
			environment,
		);
		expect(new Set(plan.next.split(" ")), property).toEqual(
			new Set([after, companion, "text-red-500"].filter(Boolean).join(" ").split(" ")),
		);
		expect(plan.roots.size, property).toBeGreaterThan(0);
		const inverse = await planPropertyValue(
			f.root,
			f.inputs,
			plan.next,
			operation,
			{
				kind: "binding",
				tokens: before.split(" "),
			},
			environment,
		);
		expect(new Set(inverse.next.split(" ")), property).toEqual(new Set(literal.split(" ")));
	},
);

it.each(layoutProperties)(
	"creates and removes retained layout %i %s against its own declaration",
	async (_index, property, _before, after, companion) => {
		const f = fixture();
		const operation = { kind: "property", property, scope: "" } as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const bare = [companion, "text-red-500"].filter(Boolean).join(" ");
		const created = await planPropertyValue(
			f.root,
			f.inputs,
			bare,
			operation,
			{ kind: "binding", tokens: after.split(" ") },
			environment,
		);
		expect(new Set(created.next.split(" ")), property).toEqual(new Set([...bare.split(" "), ...after.split(" ")]));
		const removed = await planPropertyValue(
			f.root,
			f.inputs,
			created.next,
			operation,
			{ kind: "remove" },
			environment,
		);
		expect(new Set(removed.next.split(" ").filter(Boolean)), property).toEqual(new Set(bare.split(" ")));
		expect(removed.before, property).toEqual(after.split(" "));
	},
);

/** The layout rows a person types a value straight into, and the words that refuse one. */
const typedLayout = layoutProperties.filter(([, property]) => {
	const rule = rowFor(property)?.rule;
	return rule?.kind === "length" && LENGTHS[rule.family] === "spacing";
});
const spelledLayout = layoutProperties.filter(([, property]) => rowFor(property)?.arbitrary.ok === false);

it.each(typedLayout)(
	"authors an exact custom layout value for %i %s and restores its original binding",
	async (_index, property, before, _after, companion) => {
		const f = fixture();
		const operation = { kind: "property", property, scope: "" } as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const literal = [before, companion, "text-red-500"].filter(Boolean).join(" ");
		const custom = await planPropertyValue(
			f.root,
			f.inputs,
			literal,
			operation,
			{
				kind: "custom",
				value: "7.999px",
			},
			environment,
		);
		// the typed decimal is what the file says, not the pixel it rounds to
		expect(custom.next, property).toContain("[7.999px]");
		expect(custom.next.includes(before), property).toBe(false);
		const back = await planPropertyValue(
			f.root,
			f.inputs,
			custom.next,
			operation,
			{
				kind: "binding",
				tokens: [before],
			},
			environment,
		);
		expect(new Set(back.next.split(" ")), property).toEqual(new Set(literal.split(" ")));
	},
);

it.each(spelledLayout)("refuses a typed value for the layout word %i %s", async (_index, property, before) => {
	const f = fixture();
	await expect(
		planPropertyValue(
			f.root,
			f.inputs,
			[before, "text-red-500"].join(" "),
			{ kind: "property", property, scope: "" },
			{ kind: "custom", value: "12px" },
			{ direction: "ltr", writingMode: "horizontal-tb" },
		),
	).rejects.toThrow("no utility");
});

it("plans a track list the compiler emits and refuses one it does not", async () => {
	const f = fixture();
	const operation = { kind: "property", property: "grid-template-columns", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		f.root,
		f.inputs,
		"grid-cols-2",
		operation,
		{
			kind: "custom",
			value: "repeat(3, minmax(0, 2fr))",
		},
		environment,
	);
	expect(plan.next).toBe("grid-cols-[repeat(3,_minmax(0,_2fr))]");
	// a token that compiles but declares another property owns nothing here, and
	// the plan says so rather than writing it and hoping
	await expect(
		planPropertyValue(
			f.root,
			f.inputs,
			"grid-cols-2",
			operation,
			{ kind: "binding", tokens: ["text-red-500"] },
			environment,
		),
	).rejects.toThrow("no compiled effect for this property");
});

it("writes a logical spacing side in the writing context it is actually read in", async () => {
	const f = fixture();
	const operation = { kind: "property", property: "padding-inline-start", scope: "" } as const;
	const sides = [];
	for (const direction of ["ltr", "rtl"] as const) {
		const plan = await planPropertyValue(
			f.root,
			f.inputs,
			"ps-2 pr-4",
			operation,
			{ kind: "binding", tokens: ["ps-6"] },
			{ direction, writingMode: "horizontal-tb" },
		);
		sides.push([...plan.roots]);
		// the side it lands on is the one the document actually reads it as: in a
		// left-to-right document the authored right padding is untouched, and in a
		// right-to-left one it is the same side, so it is what this change replaces
		expect(plan.next, direction).toBe(direction === "ltr" ? "pr-4 ps-6" : "ps-6");
	}
	expect(sides).toEqual([["padding-left"], ["padding-right"]]);
});

it.each([
	["width mode", "w-auto", "w-full", "width"],
	["height mode", "h-auto", "h-full", "height"],
	["width and height", "size-2", "size-4", "width"],
])("plans the %s control against the axis it actually declares", async (property, before, after, declared) => {
	const f = fixture();
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		f.root,
		f.inputs,
		`${before} text-red-500`,
		{ kind: "property", property, scope: "" },
		{ kind: "binding", tokens: [after] },
		environment,
	);
	expect(plan.before).toEqual([before]);
	expect(plan.next).toBe(`text-red-500 ${after}`);
	expect([...plan.roots]).toContain(declared);
});

it("refuses a negative padding the compiler cannot spell while a negative margin is authored", async () => {
	const f = fixture();
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const margin = await planPropertyValue(
		f.root,
		f.inputs,
		"p-4 m-4",
		{ kind: "property", property: "margin", scope: "" },
		{ kind: "binding", tokens: ["-m-5"] },
		environment,
	);
	expect(margin.next).toBe("p-4 -m-5");
	await expect(
		planPropertyValue(
			f.root,
			f.inputs,
			"p-4 m-4",
			{ kind: "property", property: "padding", scope: "" },
			{ kind: "binding", tokens: ["-p-5"] },
			environment,
		),
	).rejects.toThrow("no compiled effect for this property");
});
