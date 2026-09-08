import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { SourcePropertyGroupValue } from "../source-property-group";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { planPropertyGroup } from "./source-property-group";

const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
function fixture() {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme {--color-brand: #123456;}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	return { root, inputs: new Map([[file, readInput(file)]]) };
}

it.each([false, true])(
	"plans size and color together while retaining independent leading and stacking (reverse: %s)",
	async (reverse) => {
		const f = fixture();
		const request: Extract<SourcePropertyGroupValue, { kind: "fields" }> = {
			kind: "fields",
			changes: [
				{ property: "font-size", scope: "", value: { kind: "binding", tokens: ["text-lg"] } },
				{ property: "color", scope: "", value: { kind: "binding", tokens: ["text-brand"] } },
			],
		};
		const plan = await planPropertyGroup(
			f.root,
			f.inputs,
			"text-sm text-red-500 leading-loose z-10",
			{ ...request, changes: reverse ? [...request.changes].reverse() : request.changes },
			environment,
		);
		expect(new Set(plan.next.split(" "))).toEqual(new Set(["text-lg", "text-brand", "leading-loose", "z-10"]));
		expect(
			plan.selections
				.find((selection) => selection.kind === "field" && selection.property === "font-size")
				?.roots.has("line-height"),
		).toBe(true);
		const actual = await compilePropertySource(f.root, f.inputs, plan.next);
		expect(actual.effects).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ owner: "text-lg", property: "font-size", value: "var(--text-lg)" }),
				expect.objectContaining({ owner: "text-brand", property: "color", value: "var(--color-brand)" }),
				expect.objectContaining({ owner: "z-10", property: "z-index", value: "10" }),
			]),
		);
	},
);

it("removes only the exact hover scope and keeps bundled defaults and other predicates", async () => {
	const f = fixture();
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"border-2 hover:border-4 hover:text-brand md:text-lg md:hover:opacity-50 z-10",
		{ kind: "remove-scope", scope: "hover:" },
		environment,
		":root { --outside: 12px; }",
	);
	expect(plan.next).toBe("border-2 md:text-lg md:hover:opacity-50 z-10");
	expect(plan.before).toEqual(["hover:border-4", "hover:text-brand"]);
	expect(plan.after).toEqual([]);
	expect(plan.desired.effects).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ owner: "border-2", property: "border-width", value: "2px" }),
			expect.objectContaining({ owner: "md:text-lg", property: "font-size", value: "var(--text-lg)" }),
			expect.objectContaining({ owner: null, property: "--outside", value: "12px" }),
		]),
	);
	expect(plan.selections).toHaveLength(1);
	expect(plan.selections[0]?.scope).toBe("hover:");
	expect(plan.selections[0]?.scopePaths).toEqual(expect.arrayContaining([expect.arrayContaining(["$:hover"])]));
	expect(plan.external).toContain("--tw-border-style");
});

it("replaces an exact raw token without changing another written scope", async () => {
	const f = fixture();
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"opacity-75 hover:opacity-50 md:opacity-25 marker",
		{ kind: "tokens", add: ["hover:opacity-100"], remove: ["hover:opacity-50"] },
		environment,
	);
	expect(plan.next).toBe("opacity-75 md:opacity-25 marker hover:opacity-100");
	expect(plan.before).toEqual(["hover:opacity-50"]);
	expect(plan.after).toEqual(["hover:opacity-100"]);
	expect(plan.selections).toMatchObject([{ kind: "effects", scope: "hover:" }]);
	expect(plan.consumers).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ owner: "opacity-75", property: "opacity", value: "75%" }),
			expect.objectContaining({ owner: "hover:opacity-100", property: "opacity", value: "100%" }),
		]),
	);
});

it("groups a border component and color without detaching other sides", async () => {
	const f = fixture();
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"border-2 border-red-500 z-10",
		{
			kind: "fields",
			changes: [
				{ property: "border-top-width", scope: "", value: { kind: "custom", value: "4px" } },
				{ property: "border-color", scope: "", value: { kind: "binding", tokens: ["border-brand"] } },
			],
		},
		environment,
	);
	expect(new Set(plan.next.split(" "))).toEqual(new Set(["border-2", "border-t-[4px]", "border-brand", "z-10"]));
	expect(plan.before).toEqual(["border-red-500"]);
	expect(plan.desired.effects).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ owner: "border-2", property: "border-width", value: "2px" }),
			expect.objectContaining({ owner: "border-t-[4px]", property: "border-top-width", value: "4px" }),
			expect.objectContaining({ owner: "border-brand", property: "border-color", value: "var(--color-brand)" }),
		]),
	);
	expect(plan.original.literal).toBe("border-2 border-red-500 z-10");
});

it("keeps explicit raw cross-scope intent while preserving unrequested scopes", async () => {
	const f = fixture();
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"opacity-75 hover:opacity-50 md:opacity-25",
		{ kind: "tokens", remove: ["hover:opacity-50"], add: ["focus:opacity-100"] },
		environment,
	);
	expect(plan.next).toBe("opacity-75 md:opacity-25 focus:opacity-100");
	expect(plan.selections.map((selection) => selection.scope)).toEqual(["hover:", "focus:"]);
});

it.each([
	{ kind: "tokens", remove: ["opacity-25"], add: [] },
	{ kind: "tokens", remove: [], add: ["opacity-50", "opacity-50"] },
	{ kind: "tokens", remove: [], add: ["opacity-75"] },
	{ kind: "tokens", remove: [], add: ["unknown-no-effect"] },
	{ kind: "tokens", remove: [], add: ["opacity-50 text-lg"] },
	{ kind: "remove-scope", scope: "" },
	{ kind: "remove-scope", scope: "focus:" },
	{ kind: "fields", changes: [] },
	{
		kind: "fields",
		changes: [
			{ property: "opacity", scope: "", value: { kind: "binding", tokens: ["opacity-50"] } },
			{ property: "opacity", scope: "", value: { kind: "binding", tokens: ["opacity-25"] } },
		],
	},
] satisfies SourcePropertyGroupValue[])("refuses ambiguous or unsupported group %#", async (request) => {
	const f = fixture();
	await expect(
		planPropertyGroup(f.root, f.inputs, "opacity-75 hover:opacity-50", request, environment),
	).rejects.toThrow();
});

it("refuses scope removal when an authored token lacks compiler ownership", async () => {
	const f = fixture();
	await expect(
		planPropertyGroup(
			f.root,
			f.inputs,
			"hover:opacity-50 hover:unknown",
			{ kind: "remove-scope", scope: "hover:" },
			environment,
		),
	).rejects.toThrow("compiled ownership");
});

it("refuses duplicate original ownership even for scope removal", async () => {
	const f = fixture();
	await expect(
		planPropertyGroup(
			f.root,
			f.inputs,
			"hover:opacity-50 hover:opacity-50",
			{ kind: "remove-scope", scope: "hover:" },
			environment,
		),
	).rejects.toThrow("duplicate");
});

it("removes two border sides from the original shorthand once", async () => {
	const f = fixture();
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"border-2 border-brand",
		{
			kind: "fields",
			changes: [
				{ property: "border-top-width", scope: "", value: { kind: "remove" } },
				{ property: "border-bottom-width", scope: "", value: { kind: "remove" } },
			],
		},
		environment,
	);
	expect(plan.before).toEqual(["border-2"]);
	expect(plan.desired.effects.filter((effect) => effect.owner !== null && effect.property.endsWith("width"))).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ property: "border-left-width", value: "2px" }),
			expect.objectContaining({ property: "border-right-width", value: "2px" }),
		]),
	);
	expect(
		plan.desired.effects.some(
			(effect) =>
				effect.owner !== null &&
				["border-width", "border-top-width", "border-bottom-width"].includes(effect.property),
		),
	).toBe(false);
	expect(plan.next).toContain("border-brand");
});

it.each([false, true])("groups deliberate size and leading (reverse: %s)", async (reverse) => {
	const f = fixture();
	const changes: Extract<SourcePropertyGroupValue, { kind: "fields" }>["changes"] = [
		{ property: "font-size", scope: "", value: { kind: "binding", tokens: ["text-lg"] } },
		{ property: "line-height", scope: "", value: { kind: "binding", tokens: ["leading-tight"] } },
	];
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"text-sm leading-loose text-brand",
		{ kind: "fields", changes: reverse ? [...changes].reverse() : changes },
		environment,
	);
	expect(new Set(plan.next.split(" "))).toEqual(new Set(["text-lg", "leading-tight", "text-brand"]));
});

it.each([false, true])("removes one border side while replacing another (reverse: %s)", async (reverse) => {
	const f = fixture();
	const changes: Extract<SourcePropertyGroupValue, { kind: "fields" }>["changes"] = [
		{ property: "border-top-width", scope: "", value: { kind: "remove" } },
		{ property: "border-bottom-width", scope: "", value: { kind: "binding", tokens: ["border-b-4"] } },
	];
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"border-2 border-brand",
		{ kind: "fields", changes: reverse ? [...changes].reverse() : changes },
		environment,
	);
	expect(plan.before).toEqual(["border-2"]);
	expect(plan.next).toContain("border-b-4");
	expect(plan.desired.effects).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ owner: "border-b-4", property: "border-bottom-width", value: "4px" }),
			expect.objectContaining({ property: "border-left-width", value: "2px" }),
			expect.objectContaining({ property: "border-right-width", value: "2px" }),
		]),
	);
	expect(
		plan.desired.effects.some(
			(effect) => effect.owner !== null && ["border-top-width", "border-width"].includes(effect.property),
		),
	).toBe(false);
});

it("keeps original input bytes and required theme evidence while planning", async () => {
	const f = fixture();
	const bytes = [...f.inputs.values()].map((input) => input.bytes.toString("utf8"));
	const plan = await planPropertyGroup(
		f.root,
		f.inputs,
		"text-brand opacity-75",
		{ kind: "tokens", remove: ["opacity-75"], add: ["opacity-50"] },
		environment,
	);
	expect([...f.inputs.values()].map((input) => input.bytes.toString("utf8"))).toEqual(bytes);
	for (const [file, input] of f.inputs) expect(readInput(file).bytes.equals(input.bytes)).toBe(true);
	expect(plan.original.literal).toBe("text-brand opacity-75");
	expect(plan.desired.literal).toBe("text-brand opacity-50");
	expect(plan.original.theme["--color-brand"]?.value).toBe("#123456");
	expect(plan.desired.theme["--color-brand"]?.value).toBe("#123456");
});

it("refuses unknown logical context instead of guessing an axis", async () => {
	const f = fixture();
	await expect(
		planPropertyGroup(
			f.root,
			f.inputs,
			"ms-2",
			{ kind: "tokens", remove: ["ms-2"], add: ["ms-4"] },
			{ direction: "ltr", writingMode: "sideways-unknown" },
		),
	).rejects.toThrow("writing mode");
});
