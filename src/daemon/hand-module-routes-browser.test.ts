import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { writeDesignFile } from "../test-helpers";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const leaf = `import {useState} from 'react';export function Button({label}){const[n,setN]=useState(0);return <button className="p-4" data-count={n} onClick={()=>setN(n+1)}>{label}</button>}export {Button as default};`;
const routes = [
	{ name: "unique among two stars", barrel: "export * from './empty';export * from './leaf';", call: "UI.Button" },
	{
		name: "diamond through imported alias",
		barrel: "export * from './alias';export * from './leaf';",
		call: "UI.Button",
	},
	{ name: "valid cycle plus leaf", barrel: "export * from './cycle';export * from './leaf';", call: "UI.Button" },
	{
		name: "nested namespace through star and rename",
		barrel: "export * from './nested';",
		call: "UI.Widgets.Controls.Button",
	},
	{ name: "namespace default", barrel: "export * as Widgets from './leaf';", call: "UI.Widgets.default" },
	{
		name: "explicit masks ambiguous stars",
		barrel: "export {Button} from './other';export * from './leaf';export * from './alias';",
		call: "UI.Button",
		owner: "other",
	},
];
function graph(barrel: string): Record<string, string> {
	return {
		"shared/ui/leaf.tsx": leaf,
		"shared/ui/other.tsx": leaf,
		"shared/ui/empty.ts": "export const nothing=1;",
		"shared/ui/alias.ts": "import {Button as Original} from './leaf';export {Original as Button};",
		"shared/ui/cycle.ts": "export * from './barrel';",
		"shared/ui/controls.ts": "export * as Controls from './leaf';",
		"shared/ui/nested.ts": "export * as Widgets from './controls';",
		"shared/ui/barrel.ts": barrel,
	};
}
const frameSource = 'import Example from "shared/example";export default function Frame(){return <Example/>}';

it.each(routes)("module route $name saves only the selected supplied label", { timeout: 120_000 }, async (sample) => {
	const source = `import * as UI from 'shared/ui/barrel';export default function Example(){return <main style={{padding:40}}><${sample.call} label="Same"/><${sample.call} label="Same"/><input id="draft" defaultValue="Kept"/></main>}`;
	const files = { ...graph(sample.barrel), "shared/example.tsx": source };
	const f = await originCanvas(files, frameSource, "button", true);
	const second = f.page.frameLocator('iframe[title="second"]');
	await expect.poll(() => second.locator("button").count()).toBe(2);
	const oracle = await originOracle(
		f,
		{
			...files,
			"shared/example.tsx": `let editable="Same";globalThis.editWords=value=>editable=value;${source.replace('label="Same"', "label={editable}")}`,
		},
		"shared/example.tsx",
	);
	for (const app of [f.frame, second, oracle]) {
		await app.locator("#draft").fill("Typed input");
		await app
			.locator("button")
			.first()
			.evaluate((el) => (el as HTMLButtonElement).click());
		await expect.poll(() => app.locator("button").first().getAttribute("data-count")).toBe("1");
	}
	const original = await f.edit();
	expect(original.scope).toBe("call-site");
	expect(original.role).toBe("literal-attribute");
	expect(original.field).toBe("label");
	expect(original.original.cell).toMatch(new RegExp(`^shared/ui/${sample.owner ?? "leaf"}\\.tsx:`));
	expect(original.source).toBe(`shared/example.tsx:1:${source.indexOf(`<${sample.call} label=`) + 1}`);
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Edited");
	await f.page.keyboard.press("Enter");
	for (let phase = 0; phase < 3; phase++) {
		const text = phase === 1 ? "Same" : "Edited";
		if (phase > 0) await f.history(phase === 2);
		await oracle.evaluate((text) => {
			Reflect.get(globalThis, "editWords")(text);
			Reflect.get(globalThis, "oracleRender")();
		}, text);
		await expect.poll(() => f.target.textContent()).toBe(text);
		await f.settled();
		await expect
			.poll(() => f.bytes())
			.toEqual({
				...files,
				"shared/example.tsx": phase === 1 ? source : source.replace('label="Same"', 'label="Edited"'),
			});
		await f.settled();
		for (const app of [f.frame, second, oracle]) {
			await expect.poll(() => app.locator("button").allTextContents()).toEqual([text, "Same"]);
			expect(await app.locator("button").first().getAttribute("data-count")).toBe("1");
			expect(await app.locator("button").nth(1).getAttribute("data-count")).toBe("0");
			expect(await app.locator("#draft").inputValue()).toBe("Typed input");
		}
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it.each([
	{
		name: "object member is not a namespace",
		setup: "import {Button} from 'shared/ui/barrel';const UI={Button};",
		call: '<UI.Button label="Same"/>',
	},
	{
		name: "namespace shadowed by parameter",
		setup: 'import * as UI from "shared/ui/barrel";function Wrap({UI}){return <UI.Button label="Same"/>}',
		call: "<Wrap UI={UI}/>",
	},
])("module route refuses $name without borrowing import spelling", { timeout: 120_000 }, async (sample) => {
	const source = `${sample.setup}export default function Example(){return <main style={{padding:40}}>${sample.call}<input id="draft" defaultValue="Kept"/></main>}`;
	const files = { ...graph("export {Button} from './leaf';"), "shared/example.tsx": source };
	const f = await originCanvas(files, frameSource, "button");
	const oracle = await originOracle(f, files, "shared/example.tsx");
	expect(await f.target.textContent()).toBe(await oracle.locator("button").textContent());
	const box = await f.select();
	await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
	await expect.poll(() => f.page.locator("[data-hand-refusal]").count()).toBe(1);
	expect(f.bytes()).toEqual(files);
	expect(f.writes).toEqual([]);
	expect(await f.target.getAttribute("contenteditable")).toBe(null);
});

it.each([
	{
		name: "star excludes default",
		barrel: "export * from './leaf';",
		importer: "import Button from 'shared/ui/barrel';",
	},
	{
		name: "ambiguous star exports",
		barrel: "export * from './leaf';export * from './other';",
		importer: "import {Button} from 'shared/ui/barrel';",
	},
	{
		name: "distinct bindings holding the same function",
		barrel: "export * from './leaf';export * from './copy';",
		importer: "import {Button} from 'shared/ui/barrel';",
	},
	{
		name: "cycle without a definition",
		barrel: "export * from './cycle';",
		importer: "import {Button} from 'shared/ui/barrel';",
	},
])("module graph refuses $name before a mounted edit exists", { timeout: 120_000 }, async (sample) => {
	const source = `${sample.importer}export default function Example(){return <main><Button label="Same"/></main>}`;
	const files = {
		...graph(sample.barrel),
		"shared/ui/copy.ts": "import {Button as Original} from './leaf';export const Button=Original;",
		"shared/example.tsx": source,
	};
	const f = await originCanvas(files, frameSource, "pre");
	expect(await f.target.textContent()).toMatch(/No matching export|Ambiguous import/);
	await expect(originOracle(f, files, "shared/example.tsx")).rejects.toThrow(/No matching export|Ambiguous import/);
	expect(await f.frame.locator("button").count()).toBe(0);
	expect(f.bytes()).toEqual(files);
	expect(f.writes).toEqual([]);
});

it("retires an original module-route edit when a previously absent higher-priority candidate appears", {
	timeout: 120_000,
}, async () => {
	const sample = routes[0];
	if (!sample) throw new Error("missing route");
	const source = `import * as UI from 'shared/ui/barrel';export default function Example(){return <main style={{padding:40}}><UI.Button label="Same"/></main>}`;
	const files = { ...graph(sample.barrel), "shared/example.tsx": source };
	const f = await originCanvas(files, frameSource, "button");
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Do not save");
	// This is an external authoring change while the actual inline edit is pending.
	writeDesignFile(f.project.root, "shared/ui/barrel.tsx", sample.barrel);
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.page.locator('[data-hand-notice="blocked"], [data-hand-refusal]').count()).toBe(1);
	expect(f.bytes()).toEqual(files);
	expect(readFileSync(f.file("shared/ui/barrel.tsx"), "utf8")).toBe(sample.barrel);
});
