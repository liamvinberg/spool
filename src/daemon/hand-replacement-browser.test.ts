import { expect, it } from "vitest";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const cases = [
	{
		name: "clone preserves every prop",
		body: "return cloneElement(children)",
		call: '<Pass><Button label="Same"/></Pass>',
		from: 'label="Same"',
		to: 'label="Edited"',
		oracle: "label={editable}",
		role: "literal-attribute",
	},
	{
		name: "clone replaces equal label",
		body: "return cloneElement(children,{label:'Same'})",
		call: '<Pass><Button label="Same"/></Pass>',
		from: "label:'Same'",
		to: 'label:"Edited"',
		oracle: "label:editable",
		role: "factory-literal",
	},
	{
		name: "clone replaces label",
		body: "return cloneElement(children,{label:'Changed'})",
		call: '<Pass><Button label="Same"/></Pass>',
		from: "label:'Changed'",
		to: 'label:"Edited"',
		oracle: "label:editable",
		role: "factory-literal",
		value: "Changed",
	},
	{
		name: "clone preserves children and class",
		body: "return cloneElement(children,{title:'New'})",
		call: '<Pass><strong className="p-4">Same</strong></Pass>',
		from: ">Same</strong>",
		to: ">Edited</strong>",
		oracle: ">{editable}</strong>",
		role: "literal-child",
	},
	{
		name: "clone replaces class and preserves children",
		body: "return cloneElement(children,{className:'p-8'})",
		call: '<Pass><strong className="p-4">Same</strong></Pass>',
		from: ">Same</strong>",
		to: ">Edited</strong>",
		oracle: ">{editable}</strong>",
		role: "literal-child",
	},
	{
		name: "clone replaces inline style and preserves children",
		body: "return cloneElement(children,{style:{padding:32}})",
		call: "<Pass><strong style={{padding:16}}>Same</strong></Pass>",
		from: ">Same</strong>",
		to: ">Edited</strong>",
		oracle: ">{editable}</strong>",
		role: "literal-child",
	},
	{
		name: "clone replaces children and preserves style",
		body: "return cloneElement(children,{},'Changed')",
		call: '<Pass><strong className="p-4">Same</strong></Pass>',
		from: "{},'Changed'",
		to: '{},"Edited"',
		oracle: "{},editable",
		role: "factory-literal",
		value: "Changed",
	},
	{
		name: "clone replaces named slot",
		body: 'return cloneElement(children,{header:<Button label="Replacement"/>})',
		call: '<Pass><Header header={<Button label="Same"/>}/></Pass>',
		from: 'label="Replacement"',
		to: 'label="Edited"',
		oracle: "label={editable}",
		role: "literal-attribute",
		value: "Replacement",
	},
	{
		name: "recreated component has no observed creation",
		body: "return createElement(children.type,{label:'Same'})",
		call: '<Pass><Button label="Same"/></Pass>',
		from: "label:'Same'",
		to: 'label:"Edited"',
		oracle: "label:editable",
		role: "factory-literal",
	},
	{
		name: "Children.toArray creates keyed elements",
		body: "return Children.toArray(children)",
		call: '<Pass><Button label="Same"/><Button label="Same"/></Pass>',
		from: 'label="Same"',
		to: 'label="Edited"',
		oracle: "label={editable}",
		role: "literal-attribute",
	},
	{
		name: "cached first child between different callers",
		body: "globalThis.saved??=children;return globalThis.saved",
		call: '<><Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass></>',
		from: 'label="Same"',
		to: 'label="Edited"',
		oracle: "label={editable}",
		role: "literal-attribute",
		refused: true,
	},
	{
		name: "named header slot",
		body: "return header",
		call: '<Pass header={<Button label="Same"/>}/>',
		from: 'label="Same"',
		to: 'label="Edited"',
		oracle: "label={editable}",
		role: "literal-attribute",
	},
	{
		name: "changed conditional child relationship",
		body: "return children",
		call: '<Pass>{flip ? <Button label="Same"/> : <Button label="Same" />}</Pass>',
		from: 'label="Same"/>',
		to: 'label="Edited"/>',
		oracle: "label={editable}/>",
		role: "literal-attribute",
		flip: true,
	},
	{
		name: "changed named slot relationship",
		body: "return flip ? footer : header",
		call: '<Pass flip={flip} header={<Button label="Same"/>} footer={<Button label="Same"/>}/>',
		from: 'footer={<Button label="Same"',
		to: 'footer={<Button label="Edited"',
		oracle: "footer={<Button label={editable}",
		role: "literal-attribute",
		flip: true,
	},
	{
		name: "ordinary unobserved component createElement",
		body: "return children",
		call: "{createElement(Button,{label:'Same'})}",
		from: "label:'Same'",
		to: 'label:"Edited"',
		oracle: "label:editable",
		role: "factory-literal",
	},
	{
		name: "ordinary unobserved host createElement",
		body: "return children",
		call: "{createElement('strong',{className:'p-4'},'Same')}",
		from: "},'Same'",
		to: '},"Edited"',
		oracle: "},editable",
		role: "factory-literal",
	},
];
function authored(sample: (typeof cases)[number]) {
	return `import {Children,cloneElement,createElement,useState} from 'react';
const Button=({label})=><button className="p-4">{label}</button>;const Header=({header})=>header;
function Pass({children,header,footer,flip}){${sample.body}}
export default function Sample(){const [flip,setFlip]=useState(false);const[n,setN]=useState(0);globalThis.flip=()=>setFlip(x=>!x);globalThis.bump=()=>setN(x=>x+1);return <main style={{padding:40}}><div id="subject">${sample.call}</div><output>{n}</output><input id="draft" defaultValue="Kept"/><h2 id="unrelated">Same</h2></main>}`;
}
const frameSource = 'import Sample from "shared/case";export default function Frame(){return <Sample/>}';

it.each(cases)(
	"replacement $name follows its exact owner through canvas history",
	{ timeout: 120_000 },
	async (sample) => {
		const source = authored(sample),
			value = sample.value ?? "Same";
		const files = { "shared/case.tsx": source };
		const f = await originCanvas(files, frameSource, "#subject button,#subject strong", true);
		const second = f.page.frameLocator('iframe[title="second"]');
		await expect.poll(() => second.locator("#subject").count()).toBe(1);
		const oracleSource = `let editable=${JSON.stringify(value)};globalThis.editWords=value=>editable=value;${source.replace(sample.from, sample.oracle)}`;
		const oracle = await originOracle(f, { "shared/case.tsx": oracleSource }, "shared/case.tsx");
		for (const app of [f.frame, second, oracle]) {
			await app.locator("#draft").fill("Typed input");
			await app.locator("#subject").evaluate((_el, flip) => {
				Reflect.get(globalThis, "bump")();
				if (flip) Reflect.get(globalThis, "flip")();
			}, sample.flip ?? false);
			await expect.poll(() => app.locator("output").textContent()).toBe("1");
		}
		const shape = async (app: typeof f.frame | typeof oracle) =>
			app.locator("#subject").evaluate((el) =>
				Array.from(el.querySelectorAll("button,strong"), (node) => ({
					tag: node.tagName,
					text: node.textContent,
					class: node.getAttribute("class"),
					style: node.getAttribute("style"),
					title: node.getAttribute("title"),
				})),
			);
		expect(await shape(f.frame)).toEqual(await shape(oracle));
		if (sample.refused) {
			const box = await f.select();
			await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
			await expect.poll(() => f.page.locator("[data-hand-refusal]").count()).toBe(1);
			expect(f.bytes()).toEqual(files);
			expect(f.writes).toEqual([]);
			return;
		}
		const original = await f.edit();
		expect(original.value).toBe(value);
		expect(original.role).toBe(sample.role);
		expect(original.source).toMatch(/^shared\/case\.tsx:/);
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Edited");
		await f.page.keyboard.press("Enter");
		for (let phase = 0; phase < 3; phase++) {
			const text = phase === 1 ? value : "Edited";
			if (phase > 0) await f.history(phase === 2);
			await oracle.evaluate((text) => {
				Reflect.get(globalThis, "editWords")(text);
				Reflect.get(globalThis, "oracleRender")();
			}, text);
			await expect.poll(() => f.target.textContent()).toBe(text);
			await f.settled();
			await expect.poll(() => second.locator("#subject button,#subject strong").first().textContent()).toBe(text);
			await expect
				.poll(() => f.bytes())
				.toEqual({
					"shared/case.tsx": phase === 1 ? source : source.replace(sample.from, sample.to),
				});
			expect(await shape(f.frame)).toEqual(await shape(oracle));
			for (const app of [f.frame, second, oracle]) {
				expect(await app.locator("#draft").inputValue()).toBe("Typed input");
				expect(await app.locator("output").textContent()).toBe("1");
				expect(await app.locator("#unrelated").textContent()).toBe("Same");
			}
			if (sample.name === "Children.toArray creates keyed elements")
				expect(await f.frame.locator("#subject button").nth(1).textContent()).toBe("Same");
		}
		expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
	},
);

it.each(cases.filter((sample) => sample.flip))(
	"replacement $name refuses to retarget a pending edit after the authored branch changes",
	{ timeout: 120_000 },
	async (sample) => {
		const source = authored(sample),
			files = { "shared/case.tsx": source };
		const f = await originCanvas(files, frameSource, "#subject button");
		await f.edit();
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Do not move this edit");
		const commits = await f.target.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits);
		await f.frame.locator("#subject").evaluate(() => Reflect.get(globalThis, "flip")());
		await expect.poll(() => f.target.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits)).toBeGreaterThan(commits);
		await f.page.keyboard.press("Enter");
		await expect.poll(() => f.page.locator('[data-hand-notice="blocked"], [data-hand-refusal]').count()).toBe(1);
		expect(f.bytes()).toEqual(files);
	},
);
