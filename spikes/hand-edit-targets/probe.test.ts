import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDesignEntry } from "../../src/daemon/compile";
import { realDesignDir } from "../../src/daemon/design-path";
import { createFlowGraph } from "../../src/daemon/flows";
import { patchSite, revertTarget } from "../../src/daemon/hand-lane";
import { applySpan, fingerprintOf, planOps, readElements, spanBetween } from "../../src/daemon/hand-write";
import { buildFrameCss } from "../../src/daemon/tailwind";
import { classThemeOf, compileClasses, readTheme } from "../../src/daemon/theme";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { button, first, nested, second, tokens, unused } from "./fixtures";
import { directParameter, elementAt, references, sourceTarget, stamp, swapSiblings } from "./targets";

const evidence: Record<string, unknown> = {};
const deps = { framesUsing: async () => ["first", "second"] };
function project() {
	const root = makeTempDir();
	markProject(root);
	for (const [path, source] of Object.entries({
		"shared/ui/button.tsx": button,
		"shared/ui/shell.tsx": nested,
		"frames/first/frame.tsx": first,
		"frames/second/frame.tsx": second,
		"frames/unused/frame.tsx": unused,
		"shared/tokens.css": tokens,
	}))
		writeDesignFile(root, path, source);
	return root;
}
const changed = (planned: ReturnType<typeof planOps>) => {
	if (!planned.ok) throw new Error(planned.refusal.code);
	return planned.text;
};
const style = (source: string, at: string, token: string, scope = "") =>
	planOps(source, [{ kind: "set-class", source: at, token, scope }]);

async function bundle(root: string, frame: string, instrumented: boolean) {
	const designDir = realDesignDir(root);
	const compiled = await buildDesignEntry({
		designDir,
		resolveDir: join(designDir, "frames", frame),
		sourcefile: "<probe>",
		contents: `import Frame from './frame.tsx';\nimport { createRoot } from 'react-dom/client';\nimport { createElement } from 'react';\ncreateRoot(document.getElementById('root')).render(createElement(Frame));`,
		label: "source target probe",
	});
	const result = await build({
		stdin: { contents: compiled.bootJs, resolveDir: process.cwd(), loader: "js" },
		bundle: true,
		format: "iife",
		write: false,
		define: { "process.env.NODE_ENV": '"production"' },
		alias: {
			"spool/jsx-dev-runtime": resolve(
				instrumented ? "spikes/hand-edit-targets/runtime.tsx" : "src/runtime/jsx-dev-runtime.ts",
			),
		},
	});
	return { js: result.outputFiles[0]!.text, inputs: compiled.sourceFiles.map((file) => relative(designDir, file)) };
}

describe("source identity and reach", () => {
	let browser: Browser;
	beforeAll(async () => {
		browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	});
	afterAll(async () => {
		await browser?.close();
	});
	async function render(root: string, frame: string, instrumented = false) {
		const compiled = await bundle(root, frame, instrumented);
		const page = await browser.newPage();
		await page.setContent('<div id="root"></div>');
		await page.addScriptTag({ content: compiled.js });
		await page.locator("#root > *").first().waitFor();
		return { page, inputs: compiled.inputs };
	}
	const chain = (page: Page, selector: string) => page.locator(selector).getAttribute("data-probe-chain");

	it("observes definition stamps, two frames, nested parts and erased call sites in the shipped runtime", async () => {
		const root = project();
		const a = await render(root, "first");
		const b = await render(root, "second");
		const u = await render(root, "unused");
		const buttonStamp = stamp(button, "<button", "shared/ui/button.tsx");
		const count = (page: Page) => page.locator(`[data-spool-source="${buttonStamp}"]`).count();
		expect(await count(a.page)).toBe(7);
		expect(await count(b.page)).toBe(1);
		expect(await count(u.page)).toBe(0);
		expect(await a.page.locator("button").first().getAttribute("data-spool-source")).toBe(buttonStamp);
		expect(await chain(a.page, "button:first-of-type >> nth=0")).toBeNull();
		evidence.runtime = {
			first: await count(a.page),
			second: await count(b.page),
			unused: await count(u.page),
			firstInputs: a.inputs,
			unusedInputs: u.inputs,
			callSitesOnDOM: false,
		};
		await Promise.all([a.page.close(), b.page.close(), u.page.close()]);
	});

	it("carries nested call ancestry without a DOM root assumption, and keeps keyed identity through reorder", async () => {
		const { page } = await render(project(), "first", true);
		const buttons = page.locator("main > button");
		const mac = await buttons.nth(0).getAttribute("data-probe-chain");
		const windows = await buttons.nth(1).getAttribute("data-probe-chain");
		expect(mac).not.toBe(windows);
		expect(JSON.parse(mac ?? "[]")[0].source).toBe(stamp(first, '<Button label="Download Mac"'));
		expect(
			JSON.parse((await chain(page, "section button")) ?? "[]").map((c: { source: string }) => c.source),
		).toEqual([stamp(first, "<Shell"), stamp(nested, "<Button", "shared/ui/shell.tsx")]);
		expect(await chain(page, "b >> nth=0")).toBe(await chain(page, "b >> nth=1"));
		expect(await page.locator("aside").count()).toBe(0);
		const keyed = await chain(page, "#rows button >> nth=0");
		const unkeyed = await chain(page, "#unkeyed button >> nth=0");
		await page.locator("#reverse").click();
		expect(await page.locator("#rows button").nth(1).textContent()).toContain("Alpha");
		expect(await chain(page, "#rows button >> nth=1")).toBe(keyed);
		expect(await chain(page, "#unkeyed button >> nth=1")).not.toBe(unkeyed);
		expect(await chain(page, "#unkeyed button >> nth=0")).toBe(unkeyed); // now Beta: identity is component lifetime, not data identity
		await page.locator("#toggle").click();
		expect(await page.getByText("Conditional", { exact: true }).count()).toBe(1);
		evidence.ancestry = {
			nestedDepth: 2,
			multipleRoots: "one call, two hosts",
			absentRoot: "no selectable host",
			keyedReorder: "same mounted occurrence",
			unkeyedReorder: "same occurrence can carry different data",
			persistence: "none; remount/navigation/source revision must invalidate",
		};
		await page.close();
	});

	it("distinguishes file dependencies, source references and committed rendered occurrences", async () => {
		const root = project();
		const graph = createFlowGraph();
		await graph.sources(root);
		const aliasReach = graph.framesUsing(root, "shared/ui/button.tsx");
		expect(aliasReach).toBeUndefined();
		for (const [frame, source] of [
			["first", first],
			["second", second],
			["unused", unused],
		] as const) {
			writeDesignFile(root, `frames/${frame}/frame.tsx`, source.replaceAll('"shared/', '"../../shared/'));
		}
		await graph.sources(root);
		const relativeReach = graph.framesUsing(root, "shared/ui/button.tsx");
		expect(relativeReach?.sort()).toEqual(["first", "second", "unused"]);
		const sites = references(first, "Button");
		expect(sites).toHaveLength(5);
		expect(sites.filter((site) => site.conditional)).toHaveLength(1);
		expect(sites.filter((site) => site.repeated)).toHaveLength(2);
		expect(references(first, "Unused")).toHaveLength(0);
		expect(references(unused, "Button")).toHaveLength(0);
		expect(references(nested, "Button")).toHaveLength(1);
		writeDesignFile(root, "frames/second/frame.tsx", "export default () => <p>Removed import</p>");
		await graph.sources(root);
		expect(graph.framesUsing(root, "shared/ui/button.tsx")?.sort()).toEqual(["first", "unused"]);
		evidence.dependencies = {
			aliasReach: aliasReach ?? "unknown (alias omitted)",
			relativeReach,
			firstButtonJSXSites: sites,
			nestedButtonJSXSites: references(nested, "Button"),
			importedButUnusedExportSites: 0,
			afterRemovingImport: graph.framesUsing(root, "shared/ui/button.tsx"),
			claim: "files reached, not export uses or rendered counts",
		};
	});

	it("writes a shared definition and a proven literal parameter at different source targets", async () => {
		const root = project();
		const shared = stamp(button, "<button", "shared/ui/button.tsx");
		expect(
			(await patchSite(root, "first", [{ kind: "set-class", source: shared, token: "px-8", scope: "" }], deps)).kind,
		).toBe("refusal");
		const sharedText = changed(style(button, shared, "px-8"));
		writeDesignFile(root, "shared/ui/button.tsx", sharedText);
		const inner = stamp(button, "<span", "shared/ui/button.tsx");
		expect(directParameter(button, inner)).toBe("label");
		expect(directParameter(nested, stamp(nested, "<Button", "shared/ui/shell.tsx"), "label")).toBe("label");
		expect(
			directParameter(button, stamp(button, "<span>{label.toUpperCase", "shared/ui/button.tsx")),
		).toBeUndefined();
		const site = stamp(first, '<Button label="Download Mac"');
		const localText = changed(
			planOps(first, [{ kind: "set-attribute", source: site, name: "label", value: "Get Mac" }]),
		);
		writeDesignFile(root, "frames/first/frame.tsx", localText);
		const a = await render(root, "first");
		const b = await render(root, "second");
		expect(await a.page.getByText("Get Mac", { exact: true }).count()).toBe(1);
		expect(await a.page.getByText("Download Windows", { exact: true }).count()).toBe(1);
		expect(await b.page.getByText("Other frame", { exact: true }).count()).toBe(1);
		expect(await a.page.locator("button.px-8").count()).toBe(7);
		expect(await b.page.locator("button.px-8").count()).toBe(1);
		const child = stamp(first, "<Child>");
		expect(directParameter(button, stamp(button, "<strong", "shared/ui/button.tsx"))).toBe("children");
		expect(changed(planOps(first, [{ kind: "set-text", source: child, text: "New child" }]))).toContain(
			"<Child>New child</Child>",
		);
		evidence.targets = {
			definition: "all 8 committed Button hosts changed classes",
			callSite: "only Mac label changed",
			nested: "two direct parameter reads demonstrated",
			transformed: "refused",
			shippedSharedGate: "still refuses",
		};
		await Promise.all([a.page.close(), b.page.close()]);
	});

	it("measures inheritance, competing CSS, units and explicit responsive/state conditions independently of source", async () => {
		const root = project();
		const source = `export default function Frame() { return <div style={{ color: 'rgb(9, 8, 7)' }}>
<p id="inherit">Inherited</p><p id="override" className="text-brand">Override</p>
<p id="compete" className="p-4 competing">CSS wins</p><p id="inline" className="p-4" style={{ padding: 30 }}>Inline wins</p>
<p id="units" className="w-1/2 p-[1.5rem] gap-x-rhythm">Units</p>
<p id="scoped" className="p-4 wide:p-8 hover:p-12">Scopes</p></div> }`;
		writeDesignFile(root, "frames/first/frame.tsx", source);
		const rendered = await render(root, "first");
		const css = await buildFrameCss(realDesignDir(root), [join(realDesignDir(root), "frames/first/frame.tsx")]);
		await rendered.page.addStyleTag({
			content: `${css.css}\nhtml { font-size: 20px } .competing { padding: 37px } .alternate { --brand: #abcdef }`,
		});
		const read = (selector: string, property: string) =>
			rendered.page.locator(selector).evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
		expect(await read("#inherit", "color")).toBe("rgb(9, 8, 7)");
		expect(await read("#override", "color")).toBe("rgb(18, 52, 86)");
		await rendered.page.locator("#override").evaluate((el) => el.classList.add("alternate"));
		expect(await read("#override", "color")).toBe("rgb(171, 205, 239)");
		expect((await readTheme(root)).colour.find((token) => token.name === "brand")?.value).toBe("var(--brand)");
		expect(await read("#compete", "padding-top")).toBe("37px");
		expect(await read("#inline", "padding-top")).toBe("30px");
		expect(await read("#units", "padding-top")).toBe("30px");
		expect(await read("#units", "column-gap")).toBe("10px");
		await rendered.page.setViewportSize({ width: 700, height: 700 });
		expect(await read("#scoped", "padding-top")).toBe("20px");
		await rendered.page.setViewportSize({ width: 1300, height: 700 });
		expect(await read("#scoped", "padding-top")).toBe("40px");
		await rendered.page.locator("#scoped").hover();
		expect(await read("#scoped", "padding-top")).toBe("60px");
		const write = style(source, stamp(source, '<p id="compete"'), "p-8");
		expect(write.ok).toBe(true); // proves source rewrite, not ownership of winning declaration
		expect(style(source, stamp(source, '<p id="inline"'), "p-8")).toMatchObject({
			ok: false,
			refusal: { code: "inline-style" },
		});
		evidence.cascade = {
			inheritance: "9 8 7",
			explicitToken: "18 52 86",
			conditionalAlias: "171 205 239 without changing reference",
			competingCSS: "37px despite p-4",
			inline: "30px; writer refuses",
			authoredRem: "1.5rem = 30px at root 20px",
			namedSpacing: "10px",
			base: "20px",
			wide: "40px",
			hover: "60px",
			compiledThemeStep: (await readTheme(root)).step,
			actualSpacingStep: "5px",
			winnerResolver: "not implemented",
		};
		await rendered.page.close();
	});
});

describe("source-only gates and mutations", () => {
	it("preserves units, aliases, unrelated declarations and explicit write scopes when applying tokens", async () => {
		const root = project();
		const theme = await readTheme(root);
		const candidates = [
			"bg-brand",
			"gap-x-rhythm",
			"gap-x-4",
			"rounded-panel",
			"text-red-500",
			"text-lg",
			"font-semibold",
			"leading-tight",
			"tracking-wide",
		];
		const compiled = await compileClasses(root, candidates);
		expect(compiled.every((c) => c.ok)).toBe(true);
		expect(compiled[0]).toMatchObject({ ok: true, css: expect.stringContaining("var(--brand)") });
		expect(compiled[1]).toMatchObject({ ok: true, css: expect.stringContaining("var(--space-step)") });
		expect(theme.colour.find((c) => c.name === "brand")).toMatchObject({ from: "project", value: "var(--brand)" });
		expect(theme.colour.find((c) => c.name === "red-500")?.from).toBe("default");
		const source = '<div className="gap-4 p-[1.5rem] w-1/2 wide:p-8 hover:p-12" />';
		const result = planOps(
			source,
			[
				{ kind: "set-class", source: stamp(source, "<div"), token: "gap-x-rhythm", scope: "" },
				{ kind: "set-class", source: stamp(source, "<div"), token: "p-10", scope: "wide:" },
			],
			classThemeOf(theme),
		);
		const text = changed(result);
		expect(text).toContain("gap-y-4");
		expect(text).toContain("gap-x-rhythm");
		for (const token of ["p-[1.5rem]", "w-1/2", "wide:p-10", "hover:p-12"]) expect(text).toContain(token);
		expect(text).not.toContain("wide:p-8");
		expect(readFileSync(join(root, "design/shared/tokens.css"), "utf8")).toBe(tokens);
		const missing = "<p>Inherits</p>";
		expect(changed(style(missing, stamp(missing, "<p"), "border-2"))).toBe('<p className="border-2">Inherits</p>');
		const unrecognized = '<p className="gap-x-(--custom-space)" />';
		expect(changed(style(unrecognized, stamp(unrecognized, "<p"), "border-2"))).toContain("gap-x-(--custom-space)");
		evidence.tokens = {
			compiled,
			themeHasNamedSpacingList: "spacing" in theme,
			result: text,
			tokenDefinitionsUnchanged: true,
			projectAliasValue: theme.colour.find((c) => c.name === "brand")?.value,
		};
	});

	it("refuses expression inversion and identifies repeated templates without pretending to identify data rows", () => {
		for (const source of [
			'<p>{value + "!"}</p>',
			'<p className={cn("p-4", active && "p-8")}>Text</p>',
			"<p {...props}>Text</p>",
		]) {
			const kind = source.includes("{value") ? "set-text" : "set-class";
			const result =
				kind === "set-text"
					? planOps(source, [{ kind, source: stamp(source, "<p"), text: "New" }])
					: style(source, stamp(source, "<p"), "p-8");
			expect(result.ok).toBe(false);
		}
		const source = '<ul>{items.map(item => <li className="p-2"><span>{item.name}</span></li>)}</ul>';
		const li = stamp(source, "<li");
		expect(style(source, li, "p-4")).toMatchObject({ ok: true, mapped: true });
		expect(planOps(source, [{ kind: "delete", source: li }])).toMatchObject({
			ok: false,
			refusal: { code: "not-a-child" },
		});
		const inner = planOps(source, [{ kind: "delete", source: stamp(source, "<span") }]);
		expect(inner).toMatchObject({ ok: true, mapped: true }); // template child deletion, all rows
		const ordinaryFunction = "function row(item) { return <li>{item.name}</li> }";
		const point = elementAt(ordinaryFunction, stamp(ordinaryFunction, "<li")).node.loc!.start;
		expect(readElements(ordinaryFunction, [{ line: point.line, column: point.column + 1 }])[0]?.mapped).toBe(false);
		const shadowed = "function Row({ label }) { return items.map(label => <span>{label}</span>) }";
		expect(directParameter(shadowed, stamp(shadowed, "<span"))).toBeUndefined();
		const mutated = 'function Row({ label }) { return <div>{label = "changed"}<span>{label}</span></div> }';
		expect(directParameter(mutated, stamp(mutated, "<span"))).toBeUndefined();
		const computedProp = stamp(first, "<Button key=");
		expect(
			planOps(first, [{ kind: "set-attribute", source: computedProp, name: "label", value: "Data edit" }]),
		).toMatchObject({ ok: false, refusal: { code: "expression-attribute" } });
		evidence.generated = {
			mapStyle: "template target; repeated",
			mapRootDelete: "refused",
			innerDelete: "all template children",
			helperRepeatedElsewhere: "mapped=false is not proof of single use",
			expression: "preserved",
		};
	});

	it("deletes a call site, swaps authored siblings, and invalidates offsets after a source edit", () => {
		const mac = stamp(first, '<Button label="Download Mac"');
		const windows = stamp(first, '<Button label="Download Windows"');
		const removed = changed(planOps(first, [{ kind: "delete", source: mac }]));
		expect(removed).not.toContain('<Button label="Download Mac"');
		expect(removed).toContain('<Button label="Download Windows"');
		const swapped = swapSiblings(first, mac, windows);
		expect(swapped).toBeDefined();
		expect(swapped!.indexOf('<Button label="Download Windows"')).toBeLessThan(
			swapped!.indexOf('<Button label="Download Mac"'),
		);
		expect(applySpan(swapped!, spanBetween(first, swapped!))).toBe(first);
		expect(
			swapSiblings(first, stamp(first, "<Button key="), stamp(first, "<Button label={item.label}")),
		).toBeUndefined();
		const newer = first.replace('    <Button label="Download Mac" />\n', "");
		const atOldStamp = elementAt(newer, mac).node;
		expect(newer.slice(atOldStamp.start!, atOldStamp.end!)).toContain("Download Windows");
		expect(fingerprintOf(newer)).not.toBe(fingerprintOf(first));
		evidence.structure = {
			callSiteDeletion: "Mac only; definition preserved",
			reorder: "adjacent authored siblings only",
			inverse: "exact snapshot only",
			staleOffset: "old Mac location now identifies Windows; revision is mandatory",
		};
	});

	it("checks the canonical source role equally for write and undo, including symlink aliases and metadata", async () => {
		const root = project();
		const source = "export default () => <p>Hidden</p>";
		writeDesignFile(root, ".spool/hidden.tsx", source);
		writeDesignFile(root, "frames/first/frame.json", "{}");
		writeDesignFile(root, "node_modules/dependency.tsx", source);
		writeDesignFile(root, "custom/components.tsx", source);
		const outside = join(makeTempDir(), "outside.tsx");
		writeFileSync(outside, source);
		const alias = (name: string, target: string) => symlinkSync(target, join(root, "design/frames/first", name));
		alias("meta.tsx", join(root, "design/.spool/hidden.tsx"));
		alias("external.tsx", outside);
		alias("shared.tsx", join(root, "design/shared/ui/button.tsx"));
		alias("dependency.tsx", join(root, "design/node_modules/dependency.tsx"));
		const accepted: string[] = [];
		const rejected: string[] = [];
		for (const path of [
			"shared/ui/button.tsx",
			"frames/second/frame.tsx",
			"frames/first/shared.tsx",
			"custom/components.tsx",
		]) {
			const target = sourceTarget(root, path);
			expect(target.file).toBe(
				join(realDesignDir(root), path.endsWith("shared.tsx") ? "shared/ui/button.tsx" : path),
			);
			expect(target.revision).toBe(fingerprintOf(readFileSync(target.file, "utf8")));
			accepted.push(path);
		}
		for (const path of [
			"canvas.json",
			".spool/hidden.tsx",
			"frames/first/frame.json",
			"frames/first/meta.tsx",
			"frames/first/external.tsx",
			"frames/first/dependency.tsx",
		]) {
			expect(() => sourceTarget(root, path)).toThrow();
			rejected.push(path);
		}
		const metadata = await patchSite(
			root,
			"first",
			[{ kind: "set-text", source: stamp(source, "<p", "frames/first/meta.tsx"), text: "Oops" }],
			deps,
		);
		expect(metadata.kind).toBe("ok"); // existing lexical scope check does not exclude real metadata
		expect(revertTarget(root, "design/frames/first/meta.tsx")).toHaveProperty("file");
		expect(revertTarget(root, "design/frames/first/frame.json")).toHaveProperty("file");
		expect(revertTarget(root, "design/shared/ui/button.tsx")).toHaveProperty("status", 400);
		const escapedTarget = await patchSite(
			root,
			"first",
			[{ kind: "set-text", source: stamp(source, "<p", "frames/first/external.tsx"), text: "Oops" }],
			deps,
		);
		expect(escapedTarget.kind).toBe("error");
		evidence.boundary = {
			accepted,
			rejected,
			existingMetadataAlias: metadata.kind,
			existingRevertFrameJson: "accepted",
			existingSharedRevert: "refused",
			externalEscape: escapedTarget.kind,
			performed: "planning/gates only; no writes to forbidden files",
		};
	});
});

afterAll(() => {
	const output = process.env.HAND_TARGET_EVIDENCE;
	if (output === undefined) return;
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
});
