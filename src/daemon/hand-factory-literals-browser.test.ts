import { expect, it } from "vitest";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const words = 'A "quote" & {value} <🙂> \\path';
const jsxWords = "A &quot;quote&quot; &amp; {value} <🙂> \\path";
const cases = [
	{
		name: "shared clone label override",
		body: "cloneElement(children,{label:'Same',key:'stable',ref:undefined})",
		call: '<Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass>',
		from: "label:'Same'",
		to: `label:${JSON.stringify(words)}`,
		oracle: "label:editable",
		desired: words,
		title: false,
	},
	{
		name: "clone positional children",
		body: "cloneElement(children,{title:'Kept'},'Same')",
		call: "<Pass><strong>Original</strong></Pass>",
		from: ",'Same')",
		to: `,${JSON.stringify(words)})`,
		oracle: ",editable)",
		desired: words,
		title: false,
	},
	{
		name: "clone config children to empty string",
		body: "cloneElement(children,{children:'Same',title:'Kept'})",
		call: "<Pass><strong>Original</strong></Pass>",
		from: "children:'Same'",
		to: 'children:""',
		oracle: "children:editable",
		desired: "",
		title: false,
	},
	{
		name: "clone title",
		body: "cloneElement(children,{title:'Same'})",
		call: '<Pass><strong title="Original">Kept</strong></Pass>',
		from: "title:'Same'",
		to: `title:${JSON.stringify(words)}`,
		oracle: "title:editable",
		desired: words,
		title: true,
	},
	{
		name: "direct component factory",
		body: "children",
		call: "{createElement(Button,{label:'Same',key:'a'})}{createElement(Button,{label:'Same',key:'b'})}",
		from: "label:'Same'",
		to: `label:${JSON.stringify(words)}`,
		oracle: "label:editable",
		desired: words,
		title: false,
	},
	{
		name: "direct host factory",
		body: "children",
		call: "{createElement('strong',{title:'Kept',key:'a'},'Same')}",
		from: ",'Same')",
		to: `,${JSON.stringify(words)})`,
		oracle: ",editable)",
		desired: words,
		title: false,
	},
	{
		name: "preserved original JSX field",
		body: "cloneElement(children,{title:'Kept'})",
		call: '<Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass>',
		from: 'label="Same"',
		to: `label="${jsxWords}"`,
		oracle: "label={editable}",
		desired: words,
		title: false,
	},
];
const frameSource = 'import Example from "shared/example";export default function Frame(){return <Example/>}';
it.each(cases)(
	"factory literal $name preserves its syntax and decoded value through history",
	{ timeout: 120_000 },
	async (sample) => {
		const source = `import {cloneElement,createElement,useState} from 'react';const Button=({label})=><button>{label}</button>;const Pass=({children})=>${sample.body};export default function Example(){const[n,setN]=useState(0);globalThis.bump=()=>setN(n+1);return <main style={{padding:40}}><div id="subject">${sample.call}</div><output>{n}</output><input id="draft" defaultValue="Native"/></main>}`;
		const files = { "shared/example.tsx": source },
			f = await originCanvas(files, frameSource, "#subject button,#subject strong", true),
			second = f.page.frameLocator('iframe[title="second"]');
		await expect.poll(() => second.locator("#subject").count()).toBe(1);
		const oracle = await originOracle(
			f,
			{
				"shared/example.tsx": `let editable="Same";globalThis.editWords=value=>editable=value;${source.replace(sample.from, sample.oracle)}`,
			},
			"shared/example.tsx",
		);
		for (const app of [f.frame, second, oracle]) {
			await app.locator("#draft").fill("Typed input");
			await app.locator("#draft").evaluate(() => Reflect.get(globalThis, "bump")());
			await expect.poll(() => app.locator("output").textContent()).toBe("1");
		}
		if (sample.title) {
			await f.select();
			const title = f.page.getByRole("textbox", { name: "title", exact: true });
			await expect.poll(() => title.count()).toBe(1);
			await expect.poll(() => title.inputValue()).toBe("Same");
			await title.fill(sample.desired);
			await title.press("Enter");
		} else {
			const read = await f.edit();
			expect(read.role).toBe(
				sample.name === "preserved original JSX field" ? "literal-attribute" : "factory-literal",
			);
			await f.page.keyboard.press("ControlOrMeta+a");
			if (sample.desired) await f.page.keyboard.insertText(sample.desired);
			else await f.page.keyboard.press("Backspace");
			await f.page.keyboard.press("Enter");
		}
		for (let phase = 0; phase < 3; phase++) {
			const desired = phase === 1 ? "Same" : sample.desired;
			if (phase > 0) await f.history(phase === 2);
			await oracle.evaluate((value) => {
				Reflect.get(globalThis, "editWords")(value);
				Reflect.get(globalThis, "oracleRender")();
			}, desired);
			await expect
				.poll(() => f.bytes(), { timeout: 15_000 })
				.toEqual({ "shared/example.tsx": phase === 1 ? source : source.replace(sample.from, sample.to) });
			await f.settled();
			const expected = await oracle
				.locator("#subject")
				.evaluate((el) =>
					Array.from(el.children, (node) => ({ text: node.textContent, title: node.getAttribute("title") })),
				);
			for (const app of [f.frame, second]) {
				expect(
					await app
						.locator("#subject")
						.evaluate((el) =>
							Array.from(el.children, (node) => ({ text: node.textContent, title: node.getAttribute("title") })),
						),
				).toEqual(expected);
				expect(await app.locator("#draft").inputValue()).toBe("Typed input");
				expect(await app.locator("output").textContent()).toBe("1");
			}
		}
		expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
	},
);
