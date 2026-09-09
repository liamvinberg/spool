import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { SourcePropertyValue } from "../source-property";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { appearanceProperties } from "./fixtures/property-appearance";
import { compoundLayout } from "./fixtures/property-layout";
import {
	appearanceCustom,
	appearanceCustomRefusals,
	mountPropertyNative,
	nativePropertyEffects,
	observePropertyNative,
	propertyNativeEnvironment,
} from "./fixtures/property-native-oracle";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { planPropertyValue } from "./source-property-plan";

let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(async () => {
	await browser?.close();
}, 35_000);

// The 33 appearance cases plus these eight layout cases retain all 41 compound/default contracts.
const compoundIndices = [
	39, 40, 43, 44, 47, 50, 51, 52, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 74, 77, 79, 80, 100, 102, 103,
	116, 117, 119, 122, 127, 128, 129, 130, 131, 137, 138, 139, 140,
];
const inventory = [...appearanceProperties, ...compoundLayout];

it.each([
	{ property: "border-top-width", before: "border-2", after: "border-r-2 border-b-2 border-l-2" },
	{ property: "border-top-left-radius", before: "rounded-lg", after: "rounded-tr-lg rounded-br-lg rounded-bl-lg" },
	{ property: "scale-x", before: "scale-50", after: "scale-y-50 [--tw-scale-z:50%]" },
])("native partial removal preserves the ordinary $property sibling references", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{font-size:20px;--space:10px 20px}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const context = await browser.newContext();
	onTestFinished(() => context.close(), 35_000);
	const candidate = await context.newPage();
	const ordinary = await context.newPage();
	await mountPropertyNative(candidate);
	await mountPropertyNative(ordinary);
	const environment = await propertyNativeEnvironment(candidate);
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const literal = `${row.before} z-10`;
	const initial = await compilePropertySource(root, inputs, literal);
	const before = await observePropertyNative(candidate, literal, initial.css);
	const removed = await planPropertyValue(root, inputs, literal, operation, { kind: "remove" }, environment);
	const expected = `${row.after} z-10`;
	const reference = await compilePropertySource(root, inputs, expected);
	const after = await observePropertyNative(candidate, removed.next, removed.desired.css);
	if (row.property === "scale-x") expect(after.subject.scale).toBe("1 0.5");
	expect(after).toEqual(await observePropertyNative(ordinary, expected, reference.css));
	expect(nativePropertyEffects(after)).not.toEqual(nativePropertyEffects(before));
	expect(after.state).toBe("retained native state");
	// The inverse restores the original broad authored reference, not a captured pixel value.
	const restored = await planPropertyValue(
		root,
		inputs,
		removed.next,
		operation,
		{ kind: "binding", tokens: [row.before] },
		environment,
	);
	expect(await observePropertyNative(candidate, restored.next, restored.desired.css)).toEqual(before);
	expect(restored.next).toContain(row.before);
});

it.each([
	{ value: "10px 20px", left: "10px", right: "20px" },
	{ value: "10px/20px", left: "10px 20px", right: "10px 20px" },
	{ value: "10px /20px", left: "10px 20px", right: "10px 20px" },
])("refuses unknown native shorthand arity $value without changing other corners", async ({ value, left, right }) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", `:root{font-size:20px} main{--radius-lg:${value}}`);
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const context = await browser.newContext();
	onTestFinished(() => context.close(), 35_000);
	const page = await context.newPage();
	await mountPropertyNative(page);
	const literal = "rounded-lg z-10";
	const original = await compilePropertySource(root, inputs, literal);
	const before = await observePropertyNative(page, literal, original.css);
	expect(before.subject["border-top-left-radius"]).toBe(left);
	expect(before.subject["border-top-right-radius"]).toBe(right);
	const environment = await propertyNativeEnvironment(page);
	await expect(
		planPropertyValue(
			root,
			inputs,
			literal,
			{ kind: "property", property: "border-top-left-radius", scope: "" },
			{ kind: "remove" },
			environment,
		),
	).rejects.toThrow("this whole shorthand reference has no proven single-component arity");
	expect(await observePropertyNative(page, literal, original.css)).toEqual(before);
});

it("retains every appearance row and every compound/default contract", () => {
	expect(appearanceProperties).toHaveLength(79);
	expect(compoundIndices).toHaveLength(41);
	expect(inventory.filter((row) => compoundIndices.includes(row.index))).toHaveLength(41);
	expect(new Set(inventory.map((row) => row.index)).size).toBe(87);
	expect(appearanceProperties.map((row) => row.index).sort((a, b) => a - b)).toEqual(
		[...Object.keys(appearanceCustom).map(Number), ...appearanceCustomRefusals].sort((a, b) => a - b),
	);
});

it.each(inventory)("native $index $property create/change/remove and reference restoration", async (row) => {
	const { root } = makeProject(makeTempDir());
	const tokens =
		"/* independent source comment */\n:root{font-size:20px;--space:10px 20px}\n@layer base {#subject{padding:3px}}";
	writeDesignFile(root, "shared/tokens.css", tokens);
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const context = await browser.newContext();
	onTestFinished(() => context.close(), 35_000);
	const candidate = await context.newPage();
	await mountPropertyNative(candidate, row.placeholder);
	const environment = await propertyNativeEnvironment(candidate);
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const baseline = [row.companion, "z-10"].filter(Boolean).join(" ");
	const authored = (value: string) => [value, row.companion, "z-10"].filter(Boolean).join(" ");
	let literal = baseline;
	async function reference(expected: string) {
		// Fresh compilation and a new document never see the planner's certificate or accumulated candidates.
		const compiled = await compilePropertySource(root, inputs, expected);
		const page = await context.newPage();
		try {
			await mountPropertyNative(page, row.placeholder);
			return await observePropertyNative(page, expected, compiled.css);
		} finally {
			await page.close();
		}
	}
	async function change(value: SourcePropertyValue, expected: string) {
		const plan = await planPropertyValue(root, inputs, literal, operation, value, environment);
		const actual = await observePropertyNative(candidate, plan.next, plan.desired.css);
		expect(actual, `${row.property}: ${literal} → ${expected}`).toEqual(await reference(expected));
		expect(new Set(plan.next.split(" "))).toEqual(new Set(expected.split(" ")));
		expect(actual.state).toBe("retained native state");
		expect(actual.subject["z-index"]).toBe("10");
		expect(readFileSync(file, "utf8")).toBe(tokens);
		literal = plan.next;
		return actual;
	}
	const before = await change({ kind: "binding", tokens: row.before.split(" ") }, authored(row.before));
	await change({ kind: "remove" }, baseline);
	await change({ kind: "binding", tokens: row.before.split(" ") }, authored(row.before));
	const after = await change({ kind: "binding", tokens: row.after.split(" ") }, authored(row.after));
	expect(nativePropertyEffects(after), "the independently authored change must have a native effect").not.toEqual(
		nativePropertyEffects(before),
	);
	await change({ kind: "binding", tokens: row.before.split(" ") }, authored(row.before));
	await change({ kind: "binding", tokens: row.after.split(" ") }, authored(row.after));
	await change({ kind: "remove" }, baseline);
	await change({ kind: "binding", tokens: row.after.split(" ") }, authored(row.after));
	const custom = appearanceCustom[row.index];
	if (custom) {
		const detached = await change(
			{ kind: "custom", value: custom.value },
			authored([custom.retained, custom.token].filter(Boolean).join(" ")),
		);
		expect(nativePropertyEffects(detached), "custom authored value must have a native effect").not.toEqual(
			nativePropertyEffects(after),
		);
		await change({ kind: "binding", tokens: row.after.split(" ") }, authored(row.after));
	} else if (appearanceCustomRefusals.includes(row.index)) {
		await expect(
			planPropertyValue(root, inputs, literal, operation, { kind: "custom", value: "3.5px" }, environment),
		).rejects.toThrow("no utility");
		expect(
			await observePropertyNative(candidate, literal, (await compilePropertySource(root, inputs, literal)).css),
		).toEqual(after);
	}
});
