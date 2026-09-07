import { expect, it } from "vitest";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const factoryHazards = [
	{ name: "mutated incoming props", body: "children.props.label='Same';return cloneElement(children)" },
	{
		name: "argument mutates same-valued field",
		body: "return cloneElement(children,{title:(children.props.label='Same','new')})",
	},
	{ name: "cached alias", body: "globalThis.saved??=children;return cloneElement(globalThis.saved)" },
	{ name: "indirect config", body: "return cloneElement(children,globalThis.config)" },
	{ name: "mutated children type", body: "children.type=Button;return createElement(children.type,{label:'Same'})" },
	{
		name: "side-effecting recreated label",
		body: "return createElement(children.type,{label:(children.props.label='Same','Same')})",
	},
	{ name: "local alias of children type", body: "const type=children.type;return createElement(type,{label:'Same'})" },
	{ name: "spread factory config", body: "return createElement(children.type,{...{label:'Same'}})" },
	{
		name: "getter factory config",
		body: "return createElement(children.type,{get label(){globalThis.reads=(globalThis.reads??0)+1;return 'Same'}})",
	},
	{ name: "nested clone", body: "return cloneElement(cloneElement(children),{label:'Same'})" },
	{
		name: "replacement slot mutates incoming props",
		body: 'return cloneElement(children,{header:(children.props.header=<Button label="Same"/>,<Button label="Same"/>)})',
	},
];
const syntaxHazards = [
	{
		name: "map callback shadows same-valued prop",
		definition:
			"export function Button({label}){return <button>{['Same'].map(label=><span key={label}>{label}</span>)}</button>}",
		call: '<Button label="Same"/>',
		selector: "span",
	},
	{
		name: "called code can mutate props",
		definition:
			"function mutate(props){props.label='Same'}export function Button(props){return <button>{mutate(props)}<span>{props.label}</span></button>}",
		call: '<Button label="Same"/>',
		selector: "span",
	},
	{
		name: "mutable component binding",
		definition: "export let Button=({label})=><button>{label}</button>",
		call: '<Button label="Same"/>',
		selector: "button",
	},
	{
		name: "defaulted parameter",
		definition: "export const Button=({label='Same'})=><button>{label}</button>",
		call: "<Button/>",
		selector: "button",
	},
	{
		name: "JSX spread override",
		definition: "export const Button=({label})=><button>{label}</button>",
		call: "<Button {...{label:'Same'}}/>",
		selector: "button",
	},
	{
		name: "coincidentally equal transform",
		definition: "export const Button=({label})=><button>{label.trim()}</button>",
		call: '<Button label="Same"/>',
		selector: "button",
	},
];
const fixtures = [
	...factoryHazards.map((sample) => ({
		name: sample.name,
		selector: "button",
		files: {
			"shared/case.tsx": `import {cloneElement,createElement} from 'react';globalThis.config={label:'Same'};const Button=({label})=><button>{label}</button>;const Header=({header})=>header;function Pass({children}){${sample.body}}export default function Example(){return <main style={{padding:40}}><Pass>${sample.body.includes("header:") ? '<Header header={<Button label="Same"/>}/>' : '<Button label="Same"/>'}</Pass><input id="draft" defaultValue="Kept"/></main>}`,
		},
	})),
	...syntaxHazards.map((sample) => ({
		name: sample.name,
		selector: sample.selector,
		files: {
			"shared/leaf.tsx": sample.definition,
			"shared/case.tsx": `import {Button} from 'shared/leaf';export default function Example(){return <main style={{padding:40}}>${sample.call}<input id="draft" defaultValue="Kept"/></main>}`,
		},
	})),
];
const frameSource = 'import Example from "shared/case";export default function Frame(){return <Example/>}';
it.each(fixtures)(
	"origin refuses $name without source writes or extra authored evaluation",
	{ timeout: 120_000 },
	async (sample) => {
		const f = await originCanvas(sample.files, frameSource, sample.selector);
		const oracle = await originOracle(f, sample.files, "shared/case.tsx");
		for (const app of [f.frame, oracle]) await app.locator("#draft").fill("Typed input");
		const display = async (app: typeof f.frame | typeof oracle) =>
			app.locator("main").evaluate((el) => ({
				text: el.querySelector("button")?.textContent,
				title: el.querySelector("button")?.getAttribute("title"),
				input: (el.querySelector("input") as HTMLInputElement).value,
				reads: Reflect.get(globalThis, "reads") ?? 0,
			}));
		const ordinary = await display(oracle);
		expect(await display(f.frame)).toEqual(ordinary);
		const commits = await f.target.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits);
		const box = await f.select();
		await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
		await expect.poll(() => f.page.locator("[data-hand-refusal]").count()).toBe(1);
		expect(await f.target.getAttribute("contenteditable")).toBe(null);
		expect(f.bytes()).toEqual(sample.files);
		expect(f.writes).toEqual([]);
		expect(await display(f.frame)).toEqual(ordinary);
		expect(await f.target.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits)).toBe(commits);
	},
);
