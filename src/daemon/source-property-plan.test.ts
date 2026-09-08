import { realpathSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
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
it("plans every retained appearance source pair from actual declaration owners", async () => {
	const f = fixture();
	for (const row of appearanceProperties) {
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
	}
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
