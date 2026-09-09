import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { PropertyOutcome } from "../runtime/property-outcome";
import type { SourcePropertyExpectation, SourcePropertyValue } from "../source-property";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { layoutPlannerPending, layoutProperties } from "./fixtures/property-layout";
import {
	layoutCustom,
	layoutCustomRefusals,
	mountPropertyNative,
	nativePropertyEffects,
	observePropertyNative,
	propertyNativeEnvironment,
} from "./fixtures/property-native-oracle";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { planPropertyValue } from "./source-property-plan";
import { propertyScopePaths } from "./source-property-scope";

let browser: Browser;
let runtime: string;
const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
beforeAll(async () => {
	const bundled = await build({
		entryPoints: ["src/runtime/property-outcome.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyOutcome",
	});
	runtime = bundled.outputFiles[0]!.text;
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(async () => {
	await browser?.close();
}, 35_000);

const planned = layoutProperties.filter((row) => !layoutPlannerPending.includes(row.index));

it("retains every layout row and its custom or refusal contract", () => {
	expect(layoutProperties).toHaveLength(64);
	expect(planned).toHaveLength(64);
	// Every row either authors a custom value or says why its control refuses one.
	expect(layoutProperties.map((row) => row.property).sort()).toEqual(
		[...Object.keys(layoutCustom), ...Object.keys(layoutCustomRefusals)].sort(),
	);
	expect(Object.keys(layoutCustom)).toHaveLength(50);
	expect(Object.keys(layoutCustomRefusals)).toHaveLength(14);
});

// Every row mounts its own page and compiles the candidate several times, which
// no 5s default covers on a loaded runner: this is the native matrix's budget.
it.each(planned)(
	"native $index $property create/change/remove and reference restoration",
	{ timeout: 120_000 },
	async (row) => {
		const { root } = makeProject(makeTempDir());
		const tokens =
			"/* independent source comment */\n:root{font-size:20px;--space:10px 20px}\n@layer base {#subject{padding:3px}}";
		writeDesignFile(root, "shared/tokens.css", tokens);
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const inputs = new Map([[file, readInput(file)]]);
		const context = await browser.newContext();
		onTestFinished(() => context.close(), 35_000);
		const candidate = await context.newPage();
		await mountPropertyNative(candidate);
		const environment = await propertyNativeEnvironment(candidate);
		const operation = { kind: "property", property: row.property, scope: "" } as const;
		// Opacity is outside this inventory, so it stays an independent invariant for every layout row.
		const baseline = [row.companion, "opacity-50"].filter(Boolean).join(" ");
		const authored = (value: string) => [value, row.companion, "opacity-50"].filter(Boolean).join(" ");
		let literal = baseline;
		async function reference(expected: string) {
			// Fresh compilation and a new document never see the planner's certificate or accumulated candidates.
			const compiled = await compilePropertySource(root, inputs, expected);
			const page = await context.newPage();
			try {
				await mountPropertyNative(page);
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
			expect(actual.subject.opacity).toBe("0.5");
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
		const custom = layoutCustom[row.property];
		if (custom) {
			const detached = await change(
				{ kind: "custom", value: custom.value },
				authored([custom.retained, custom.token].filter(Boolean).join(" ")),
			);
			expect(nativePropertyEffects(detached), "custom authored value must have a native effect").not.toEqual(
				nativePropertyEffects(after),
			);
			await change({ kind: "binding", tokens: row.after.split(" ") }, authored(row.after));
		} else {
			expect(layoutCustomRefusals[row.property], "every refused row says why").toBeTypeOf("string");
			await expect(
				planPropertyValue(root, inputs, literal, operation, { kind: "custom", value: "3.5px" }, environment),
			).rejects.toThrow("no utility");
			expect(
				await observePropertyNative(candidate, literal, (await compilePropertySource(root, inputs, literal)).css),
			).toEqual(after);
		}
	},
);

// AC6: a definite minimum or maximum, and a flexible box, each decide the used box instead of the
// edit. Both are their own outcome, next to a use where the edit really is what the box shows.
it("reports a definite constraint and a flexible box apart from a verified layout", { timeout: 120_000 }, async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const operation = { kind: "property", property: "width", scope: "" } as const;
	const plan = await planPropertyValue(
		root,
		inputs,
		"w-2",
		operation,
		{ kind: "binding", tokens: ["w-96"] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: "width",
		scope: "",
		className: plan.next,
		absent: false,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const context = await browser.newContext();
	onTestFinished(() => context.close(), 35_000);
	const page = await context.newPage();
	await page.setContent(
		`<!doctype html><style>${plan.desired.css}</style><div style="width:300px"><div data-subject class="${plan.next}" style="max-width:100px">Clamped</div><div data-subject class="${plan.next}" style="min-width:600px">Floored</div><div data-subject class="${plan.next}">Free</div></div><div style="width:300px;display:flex"><div data-subject class="${plan.next}" style="flex-grow:1">Grown</div></div>`,
	);
	await page.addScriptTag({ content: runtime });
	const outcomes = await page.locator("[data-subject]").evaluateAll((elements, expectation) => {
		const evaluator = Reflect.get(window, "PropertyOutcome") as {
			propertyOutcome(element: Element, expected: SourcePropertyExpectation): PropertyOutcome;
		};
		return elements.map((element) => evaluator.propertyOutcome(element, expectation));
	}, expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify(outcomes),
	).toEqual(["constrained", "constrained", "verified", "constrained"]);
	expect(outcomes.map((outcome) => outcome.reason)).toEqual([
		"this used box is held by a definite native max-width",
		"this used box is held by a definite native min-width",
		undefined,
		"this used size is under a native flexible box constraint",
	]);
	// The constrained readings are not mismatches: each names the rule that decided the box.
	expect(outcomes.map((outcome) => outcome.observed)).toEqual(["100px", "600px", "384px", "300px"]);
});
