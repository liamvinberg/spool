import { readFileSync, writeFileSync } from "node:fs";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { mount, read, select, validPropertyRead } from "./automatic-browser";

let browser: Browser;
const evidence: unknown[] = [];
const roots: string[] = [];
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(async () => {
	await browser?.close();
	if (process.env.CASCADE_EVIDENCE)
		writeFileSync(
			process.env.CASCADE_EVIDENCE,
			JSON.stringify(
				{ browser: browser.version(), evidence },
				(_key, value: unknown) =>
					typeof value === "string" ? roots.reduce((text, root) => text.replaceAll(root, "<project>"), value) : value,
				2,
			),
		);
});
async function setup(classes: string, css = "", attributes = "", wrapper = '<main id="parent">', tag = "div") {
	const root = makeTempDir();
	roots.push(root);
	markProject(root);
	writeDesignFile(root, "shared/tokens.css", css);
	writeDesignFile(
		root,
		"shared/ui/box.tsx",
		`export const Box = () => <${tag} id="subject" className="${classes}" ${attributes}>Words</${tag}>;`,
	);
	writeDesignFile(
		root,
		"frames/home/frame.tsx",
		`import {Box} from 'shared/ui/box'; export default () => ${wrapper}<Box/></main>;`,
	);
	const mounted = await mount(browser, root, "home", "observed");
	return { root, mounted };
}
function supported(result: Awaited<ReturnType<typeof read>>) {
	if (result.kind !== "supported" || !result.property)
		throw new Error(result.kind === "refused" ? result.reason : "no property");
	return { ...result, property: result.property };
}

it("orders equal and unequal overlaps by emitted declarations and importance, not class order or pixels", async () => {
	for (const scenario of [
		{ classes: "p-4 pt-4", winner: "pt-4", value: "16px" },
		{ classes: "pt-4 p-4", winner: "pt-4", value: "16px" },
		{ classes: "p-4 pt-8", winner: "pt-8", value: "32px" },
		{ classes: "p-4! pt-8", winner: "p-4!", value: "16px" },
		{ classes: "p-4! pt-8!", winner: "pt-8!", value: "32px" },
	]) {
		const { mounted } = await setup(scenario.classes);
		const result = supported(
			await read(mounted, await select(mounted, "#subject"), { kind: "property", property: "padding-top", scope: "" }),
		);
		expect(result.property.owner?.token).toBe(scenario.winner);
		expect(result.property.renderedEffects[0]?.values["padding-top"]).toBe(scenario.value);
		expect(result.property.contenders).toHaveLength(2);
		expect(result.property.winners[0]?.shadowed).toHaveLength(1);
		expect(result.property.readSet.candidates).toHaveLength(2);
		expect(result.target.role).toBe("definition");
		expect(result.target.address.file).toContain("shared/ui/box.tsx");
		expect(await validPropertyRead(mounted, result)).toBe(true);
		evidence.push({ scenario, result });
		await mounted.page.close();
	}
});

it("retains different owners for a shorthand and raw unresolved shorthand values", async () => {
	for (const classes of ["p-4 pt-8", "p-(--pad) pt-8"]) {
		const { mounted } = await setup(classes, ":root {--pad: 10px 20px}");
		const result = supported(
			await read(mounted, await select(mounted, "#subject"), { kind: "property", property: "padding", scope: "" }),
		);
		expect(result.property.winners).toHaveLength(4);
		expect(result.property.winners.find((w) => w.key === "padding-top")?.owner.token).toBe("pt-8");
		expect(new Set(result.property.owners.map((o) => o.token)).size).toBe(2);
		if (classes.includes("--pad"))
			expect(result.property.owners.find((o) => o.token === "p-(--pad)")?.value).toBe("var(--pad)");
		evidence.push({ classes, result });
		await mounted.page.close();
	}
});

it("maps logical and physical overlap in every retained writing environment", async () => {
	for (const writing of ["horizontal-tb", "vertical-rl", "vertical-lr"])
		for (const direction of ["ltr", "rtl"]) {
			const { mounted } = await setup("p-4 ps-8 pt-12", `:root {writing-mode:${writing};direction:${direction}}`);
			const result = supported(
				await read(mounted, await select(mounted, "#subject"), { kind: "property", property: "padding", scope: "" }),
			);
			const inlineStart =
				writing === "horizontal-tb" ? (direction === "ltr" ? "left" : "right") : direction === "ltr" ? "top" : "bottom";
			const owner = result.property.winners.find((w) => w.key === `padding-${inlineStart}`)!.owner;
			const rendered = result.property.renderedEffects[0]!.values[`padding-${inlineStart}`];
			expect(owner.token).toBe(inlineStart === "top" ? "pt-12" : "ps-8");
			expect(rendered).toBe(inlineStart === "top" ? "48px" : "32px");
			evidence.push({ writing, direction, result });
			await mounted.page.close();
		}
});

it("separates inherited values, explicit token bindings and cross-scope rendered values", async () => {
	const { mounted } = await setup(
		"p-4 pt-8 md:pt-12 hover:pt-16",
		"@theme {--spacing: 5px; --color-brand: #123456;} :root {color: var(--color-brand)}",
	);
	const selection = await select(mounted, "#subject");
	const inherited = supported(await read(mounted, selection, { kind: "property", property: "color", scope: "" }));
	expect(inherited.property.owner).toBeNull();
	expect(inherited.property.readSet.sheetDeclarations.some((d) => d.value.includes("--color-brand"))).toBe(true);
	const base = supported(await read(mounted, selection, { kind: "property", property: "padding-top", scope: "" }));
	expect(base.property.owner?.token).toBe("pt-8");
	expect(base.property.bindings.some((b) => b.name === "--spacing" && b.from === "project")).toBe(true);
	const narrow = supported(await read(mounted, selection, { kind: "property", property: "padding-top", scope: "md:" }));
	expect(narrow.property.owner?.active).toBe(false);
	await mounted.page.setViewportSize({ width: 1000, height: 700 });
	expect(await validPropertyRead(mounted, base)).toBe(false);
	const wide = supported(await read(mounted, selection, { kind: "property", property: "padding-top", scope: "md:" }));
	expect(wide.property.owner?.active).toBe(true);
	expect(wide.property.renderedEffects[0]?.values["padding-top"]).toBe("60px");
	const inactive = supported(
		await read(mounted, selection, { kind: "property", property: "padding-top", scope: "hover:" }),
	);
	expect(inactive.property.owner?.active).toBe(false);
	await mounted.page.locator("#subject").hover();
	expect(await validPropertyRead(mounted, inactive)).toBe(false);
	const active = supported(
		await read(mounted, selection, { kind: "property", property: "padding-top", scope: "hover:" }),
	);
	expect(active.property.owner?.active).toBe(true);
	evidence.push({ inherited, base, narrow, wide, inactive, active });
	await mounted.page.close();
	const explicit = await setup("text-brand", "@theme {--color-brand: #123456;}");
	const result = supported(
		await read(explicit.mounted, await select(explicit.mounted, "#subject"), {
			kind: "property",
			property: "color",
			scope: "",
		}),
	);
	expect(result.property.owner?.token).toBe("text-brand");
	evidence.push({ explicit: result });
	await explicit.mounted.page.close();
});

it("refuses author cascade competition across layer, specificity, inheritance and priority boundaries", async () => {
	for (const css of [
		"#subject {padding-top:16px}",
		"@layer utilities {#subject {padding-top:16px}}",
		"@layer base {#subject {padding-top:16px!important}}",
		"@layer override {#subject {padding-top:16px!important}}",
		"@media (width > 900px) {#subject {padding-top:16px}}",
		"#subject {padding-top:inherit}",
	]) {
		const { mounted } = await setup("p-4 pt-4", css);
		const result = await read(mounted, await select(mounted, "#subject"), {
			kind: "property",
			property: "padding-top",
			scope: "",
		});
		expect(result.kind).toBe("refused");
		evidence.push({ css, result });
		await mounted.page.close();
	}
});

it("executes ancestor and compound states and keeps remaining conditions explicitly unproved", async () => {
	for (const scenario of [
		{
			token: "group-focus:pt-8",
			scope: "group-focus:",
			css: "",
			wrapper: '<main id="parent" className="group" tabIndex="0">',
			active: "focus",
		},
		{
			token: "peer-checked:pt-8",
			scope: "peer-checked:",
			css: "",
			wrapper: '<main id="parent"><input id="peer" className="peer" type="checkbox"/>',
			active: "peer",
		},
		{
			token: "group-hover:pt-8",
			scope: "group-hover:",
			css: "",
			wrapper: '<main id="parent" className="group">',
			active: "hover",
		},
		{
			token: "data-[open=true]:pt-8",
			scope: "data-[open=true]:",
			css: "",
			wrapper: '<main id="parent">',
			active: "data",
		},
		{
			token: "theme-dark:pt-8",
			scope: "theme-dark:",
			css: '@custom-variant theme-dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
			wrapper: '<main id="parent">',
			active: "theme",
		},
		{
			token: "@sm:pt-8",
			scope: "@sm:",
			css: "",
			wrapper: '<main id="parent" className="@container w-[200px]">',
			active: "container",
		},
		{
			token: "md:group-hover:pt-8",
			scope: "md:group-hover:",
			css: "",
			wrapper: '<main id="parent" className="group">',
			active: "hover",
		},
	]) {
		const { mounted } = await setup(`p-4 ${scenario.token}`, scenario.css, "", scenario.wrapper);
		const selection = await select(mounted, "#subject");
		const operation = { kind: "property", property: "padding-top", scope: scenario.scope } as const;
		const before = await read(mounted, selection, operation);
		const narrowPixels = await mounted.page.locator("#subject").evaluate((el) => getComputedStyle(el).paddingTop);
		await mounted.page.setViewportSize({ width: 1000, height: 700 });
		if (scenario.active === "hover") await mounted.page.locator("#subject").hover();
		if (scenario.active === "focus") await mounted.page.locator("#parent").focus();
		if (scenario.active === "peer") await mounted.page.locator("#peer").check();
		if (scenario.active === "data")
			await mounted.page.locator("#subject").evaluate((el) => el.setAttribute("data-open", "true"));
		if (scenario.active === "theme")
			await mounted.page.locator("#parent").evaluate((el) => el.setAttribute("data-theme", "dark"));
		if (scenario.active === "container")
			await mounted.page.locator("#parent").evaluate((el) => el.setAttribute("style", "width:600px"));
		const after = await read(mounted, selection, operation);
		const activePixels = await mounted.page.locator("#subject").evaluate((el) => getComputedStyle(el).paddingTop);
		if (scenario.active === "hover" || scenario.active === "peer" || scenario.active === "focus") {
			expect(supported(before).property.owner?.active).toBe(false);
			expect(supported(after).property.owner?.active).toBe(true);
			expect(await validPropertyRead(mounted, before)).toBe(false);
		} else {
			expect(before.kind).toBe("refused");
			expect(after.kind).toBe("refused");
		}
		expect(narrowPixels).toBe("16px");
		expect(activePixels).toBe("32px");
		evidence.push({ scenario, before, after, narrowPixels, activePixels });
		await mounted.page.close();
	}
});

it("retires source, CSSOM, compiler, inherited binding and structural context changes", async () => {
	for (const cause of ["source", "cssom", "disabled stylesheet", "compiler", "ancestor", "sibling"]) {
		const { root, mounted } = await setup("p-4 pt-8");
		const result = supported(
			await read(mounted, await select(mounted, "#subject"), { kind: "property", property: "padding-top", scope: "" }),
		);
		if (cause === "source")
			writeDesignFile(
				root,
				"shared/ui/box.tsx",
				`${readFileSync(result.target.address.file, "utf8")}\n// unrelated edit\n`,
			);
		if (cause === "cssom")
			await mounted.page.evaluate(() => document.styleSheets[0]!.insertRule("#subject {padding-top: 32px}"));
		if (cause === "disabled stylesheet")
			await mounted.page.evaluate(() => {
				document.styleSheets[0]!.disabled = true;
			});
		if (cause === "compiler") mounted.toolchain = "different compiler";
		if (cause === "ancestor") await mounted.page.locator("#parent").evaluate((el) => el.setAttribute("dir", "rtl"));
		if (cause === "sibling")
			await mounted.page.locator("#parent").evaluate((el) => el.append(document.createElement("span")));
		expect(await validPropertyRead(mounted, result)).toBe(false);
		evidence.push({ cause, retired: true });
		await mounted.page.close();
	}
});
