import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { SourcePropertyValue } from "../source-property";
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

let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(async () => {
	await browser?.close();
}, 35_000);

const planned = layoutProperties.filter((row) => !layoutPlannerPending.includes(row.index));

it("retains every layout row and its custom or refusal contract", () => {
	expect(layoutProperties).toHaveLength(64);
	expect(planned).toHaveLength(61);
	expect(layoutProperties.map((row) => row.index).sort((a, b) => a - b)).toEqual(
		[...Object.keys(layoutCustom).map(Number), ...layoutCustomRefusals].sort((a, b) => a - b),
	);
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
		const custom = layoutCustom[row.index];
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
			expect(layoutCustomRefusals).toContain(row.index);
			await expect(
				planPropertyValue(root, inputs, literal, operation, { kind: "custom", value: "3.5px" }, environment),
			).rejects.toThrow("no utility");
			expect(
				await observePropertyNative(candidate, literal, (await compilePropertySource(root, inputs, literal)).css),
			).toEqual(after);
		}
	},
);

it.each(layoutProperties.filter((row) => layoutPlannerPending.includes(row.index)))(
	"reports $index $property as a compound identity the planner has no compiled component for",
	{ timeout: 120_000 },
	async (row) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", ":root{font-size:20px}");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const inputs = new Map([[file, readInput(file)]]);
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		await expect(
			planPropertyValue(
				root,
				inputs,
				"opacity-50",
				{ kind: "property", property: row.property, scope: "" },
				{ kind: "binding", tokens: row.before.split(" ") },
				environment,
			),
		).rejects.toThrow("the chosen token has no compiled effect for this property");
	},
);
