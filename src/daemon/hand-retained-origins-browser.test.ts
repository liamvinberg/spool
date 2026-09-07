import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const shell = (imports: string, definitions: string, call: string) => `${imports}${definitions}
export default function Example(){const[flip,setFlip]=useState(false);const[n,setN]=useState(0);globalThis.flip=()=>setFlip(x=>!x);globalThis.bump=()=>setN(x=>x+1);return <main style={{padding:40}}>${call}<output>{n}</output><input id="draft" defaultValue="Kept"/></main>}`;
const memoCases = [
	{
		name: "same-expression default memo literal",
		body: "",
		comparator: "",
		from: 'label="Same" />',
		to: 'label="Edited" />',
		oracle: "label={editable} />",
		mismatch: false,
	},
	{
		name: "same-expression custom memo literal",
		body: "",
		comparator: ",()=>true",
		from: 'label="Same" />',
		to: 'label="Edited" />',
		oracle: "label={editable} />",
		mismatch: true,
	},
	{
		name: "retained clone-preserved field",
		body: "return cloneElement(children)",
		comparator: ",()=>true",
		from: 'label="Same" />',
		to: 'label="Edited" />',
		oracle: "label={editable} />",
		mismatch: true,
	},
	{
		name: "retained clone-overridden field",
		body: "return cloneElement(children,{label:'Same'})",
		comparator: ",()=>true",
		from: "label:'Same'",
		to: 'label:"Edited"',
		oracle: "label:editable",
		mismatch: true,
	},
	{
		name: "retained recreated-type field",
		body: "return createElement(children.type,{label:'Same'})",
		comparator: ",()=>true",
		from: "label:'Same'",
		to: 'label:"Edited"',
		oracle: "label:editable",
		mismatch: true,
	},
];
const samples = memoCases.map((sample) => {
	const call = sample.body ? '<Pass><Memo label="Same"/></Pass>' : '<Memo label="Same"/>';
	const other = sample.body ? '<Pass><Memo label="Same" /></Pass>' : '<Memo label="Same" />';
	const source = shell(
		"import {memo,cloneElement,createElement,useState} from 'react';",
		`const Button=({label})=><button className="p-4">{label}</button>;const Memo=memo(Button${sample.comparator});function Pass({children}){${sample.body || "return children"}}`,
		`{flip?${call}:${other}}`,
	);
	return {
		...sample,
		files: { "shared/example.tsx": source },
		owner: "shared/example.tsx",
		value: "Same",
		keyed: false,
		metadata: false,
		retirement: true,
	};
});
const metadata = shell(
	"import {cloneElement,useState} from 'react';",
	"const Button=({$key,$type})=><button data-own-type={$type}>{$key}</button>;const Pass=({children})=>cloneElement(children,{$key:'New prop'});",
	'<Pass><Button key="Stable key" $key="Old prop" $type="Own type prop"/></Pass>',
);
const keyed = shell(
	"import {Children,useState} from 'react';",
	"function Button({label}){const[n,set]=useState(0);return <button data-count={n} onClick={()=>set(n+1)}>{label}</button>}const Pass=({children})=>Children.toArray(children);",
	'{flip?<Pass><Button key="b" label="Same"/><Button key="a" label="Same"/></Pass>:<Pass><Button key="a" label="Same" /><Button key="b" label="Same" /></Pass>}',
);
const localSamples = [
	...samples,
	{
		name: "ordinary key and type prop names",
		files: { "shared/example.tsx": metadata },
		owner: "shared/example.tsx",
		value: "New prop",
		from: "$key:'New prop'",
		to: '$key:"Edited"',
		oracle: "$key:editable",
		mismatch: false,
		keyed: false,
		metadata: true,
		retirement: false,
	},
	{
		name: "keyed equal-label copies after authored reorder",
		files: { "shared/example.tsx": keyed },
		owner: "shared/example.tsx",
		value: "Same",
		from: 'key="b" label="Same"/>',
		to: 'key="b" label="Edited"/>',
		oracle: 'key="b" label={editable}/>',
		mismatch: false,
		keyed: true,
		metadata: false,
		retirement: false,
	},
];
const importedSamples = [true, false].map((replaced) => {
	const body = replaced
		? 'return cloneElement(children,{header:<Button label="Same"/>})'
		: "return createElement(children.type,{label:'Same'})";
	const files = {
		"shared/ui/leaf.tsx":
			'export const Button=({label})=><button className="p-4">{label}</button>;export const Header=({header})=><section>{header}</section>',
		"shared/ui/exports.ts": "export {Button,Header} from './leaf'",
		"shared/ui/pass.tsx": `import {cloneElement,createElement} from 'react';import {Button} from './exports';export function Pass({children}){${body}}`,
		"shared/ui/bridge.ts": "export {Pass} from './pass'",
		"shared/example.tsx": shell(
			"import {useState} from 'react';import {Button,Header} from 'shared/ui/exports';import {Pass} from 'shared/ui/bridge';",
			"",
			`<Pass>${replaced ? '<Header header={<Button label="Same"/>}/>' : '<Button label="Same"/>'}</Pass>`,
		),
	};
	return {
		name: replaced ? "imported replacement-slot author" : "imported recreated-type author",
		files,
		owner: "shared/ui/pass.tsx",
		value: "Same",
		from: replaced ? 'label="Same"' : "label:'Same'",
		to: replaced ? 'label="Edited"' : 'label:"Edited"',
		oracle: replaced ? "label={editable}" : "label:editable",
		mismatch: false,
		keyed: false,
		metadata: false,
		retirement: false,
	};
});
const frameSource = 'import Example from "shared/example";export default function Frame(){return <Example/>}';

it.each([...localSamples, ...importedSamples])(
	"retained origin $name preserves ordinary React decisions through source history",
	{ timeout: 120_000 },
	async (sample) => {
		const files: Record<string, string> = sample.files,
			source = files[sample.owner];
		if (!source) throw new Error("missing owner");
		const f = await originCanvas(files, frameSource, "button", true),
			second = f.page.frameLocator('iframe[title="second"]');
		await expect.poll(() => second.locator("button").count()).toBe(sample.keyed ? 2 : 1);
		const oracle = await originOracle(
			f,
			{
				...files,
				[sample.owner]: `let editable=${JSON.stringify(sample.value)};globalThis.editWords=value=>editable=value;${source.replace(sample.from, sample.oracle)}`,
			},
			"shared/example.tsx",
		);
		for (const app of [f.frame, second, oracle]) {
			await app.locator("#draft").fill("Typed input");
			await app.locator("#draft").evaluate((el) => {
				Reflect.set(window, "keptInput", el);
				Reflect.get(globalThis, "bump")();
			});
			await expect.poll(() => app.locator("output").textContent()).toBe("1");
			if (sample.keyed) {
				await app
					.locator("button")
					.first()
					.evaluate((el) => (el as HTMLButtonElement).click());
				await expect.poll(() => app.locator("button").first().getAttribute("data-count")).toBe("1");
				await app.locator("#draft").evaluate(() => Reflect.get(globalThis, "flip")());
				await expect.poll(() => app.locator("button").nth(1).getAttribute("data-count")).toBe("1");
			}
		}
		const read = await f.edit();
		expect(read.source.startsWith(`${sample.owner}:`)).toBe(true);
		expect(read.value).toBe(sample.value);
		if (sample.metadata) {
			expect(read.field).toBe("$key");
			expect(read.role).toBe("factory-literal");
		}
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Edited");
		await f.page.keyboard.press("Enter");
		for (let phase = 0; phase < 3; phase++) {
			const text = phase === 1 ? sample.value : "Edited";
			if (phase > 0) await f.history(phase === 2);
			await oracle.evaluate((text) => {
				Reflect.get(globalThis, "editWords")(text);
				Reflect.get(globalThis, "oracleRender")();
			}, text);
			await expect
				.poll(() => f.bytes(), { timeout: 15_000 })
				.toEqual({ ...files, [sample.owner]: phase === 1 ? source : source.replace(sample.from, sample.to) });
			await f.settled();
			for (const app of [f.frame, second, oracle]) {
				expect(await app.locator("button").first().textContent()).toBe(sample.mismatch ? sample.value : text);
				expect(await app.locator("#draft").inputValue()).toBe("Typed input");
				expect(await app.locator("output").textContent()).toBe("1");
				expect(await app.locator("#draft").evaluate((el) => el === Reflect.get(window, "keptInput"))).toBe(true);
				if (sample.metadata)
					expect(await app.locator("button").getAttribute("data-own-type")).toBe("Own type prop");
				if (sample.keyed) {
					expect(await app.locator("button").nth(1).textContent()).toBe("Same");
					expect(await app.locator("button").nth(1).getAttribute("data-count")).toBe("1");
					expect(await app.locator("button").first().getAttribute("data-count")).toBe("0");
				}
			}
			if (sample.mismatch && phase !== 1)
				expect(await f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(1);
		}
		expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
		if (sample.retirement) {
			await f.history();
			await oracle.evaluate((value) => {
				Reflect.get(globalThis, "editWords")(value);
				Reflect.get(globalThis, "oracleRender")();
			}, sample.value);
			await expect.poll(() => f.bytes()).toEqual(files);
			await f.settled();
			for (const app of [f.frame, second, oracle]) {
				await app.locator("#draft").evaluate(() => {
					Reflect.get(globalThis, "flip")();
					Reflect.get(globalThis, "bump")();
				});
				await expect.poll(() => app.locator("output").textContent()).toBe("2");
			}
			const writes = [...f.writes];
			const box = await f.select();
			await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
			await expect.poll(() => f.page.locator("[data-hand-refusal]").count()).toBe(1);
			expect(f.bytes()).toEqual(files);
			expect(f.writes).toEqual(writes);
		}
	},
);

it.each(importedSamples.flatMap((sample) => Object.keys(sample.files).map((dependency) => ({ sample, dependency }))))(
	"imported origin $sample.name refuses a pending source write after $dependency changes",
	{ timeout: 120_000 },
	async ({ sample, dependency }) => {
		const files: Record<string, string> = sample.files;
		const f = await originCanvas(files, frameSource, "button");
		await f.edit();
		const changed = `${files[dependency]}\n/* external revision */`;
		await f.page.route("**/source", async (route) => {
			if (route.request().postDataJSON()?.action !== "commit") return route.continue();
			writeFileSync(f.file(dependency), changed);
			await route.continue();
		});
		const response = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Do not save");
		await f.page.keyboard.press("Enter");
		expect(await (await response).json()).toMatchObject({ ok: false });
		expect(f.bytes()).toEqual({ ...files, [dependency]: changed });
	},
);
