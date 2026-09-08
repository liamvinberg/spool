import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { expect, it } from "vitest";
import { createFrameCompiler } from "./compile";
import { originCanvas } from "./hand-origin-browser-helpers";
import { Sources } from "./source-origins";
import { deriveSourceDelete } from "./source-structure";

const COMPONENTS = `import {useState,useEffect} from 'react';
function Counter({name}){const [count,setCount]=useState(0);useEffect(()=>{window.mounts=(window.mounts||0)+1},[]);return <button data-name={name} onClick={()=>setCount(count+1)}>{name}:{count}</button>}
`;

it("deletes a keyed authored call through retained source history while its sibling keeps native identity", {
	timeout: 120000,
}, async () => {
	const source = `${COMPONENTS}export default function Frame(){return <main style={{padding:40}}><Counter key="a" name="A"/><Counter key="b" name="B"/></main>}`;
	const f = await originCanvas({}, source, '[data-name="A"]');
	const verified = async () => {
		await f.settled();
		const outcome = await f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1));
		expect(outcome, JSON.stringify(outcome)).toMatchObject({
			installation: "installed",
			rendered: "verified",
		});
	};
	const sibling = f.frame.locator('[data-name="B"]');
	await sibling.evaluate((element) => {
		(element as HTMLElement).click();
		Reflect.set(window, "survivor", element);
	});
	await expect.poll(() => sibling.textContent()).toBe("B:1");
	const compiler = createFrameCompiler("structure-test");
	const document = await compiler.getDocument(f.project.root, "home", {
		projectCapability: "test",
		controlOrigin: f.project.url,
	});
	if (document.kind !== "ok") throw new Error("compilation failed");
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("missing original compilation");
	const observed = await f.target.evaluate((element) => globalThis.__SPOOL_OBSERVER__.observe(element));
	const sources = new Sources(f.project.root, compilation);
	for (const file of compilation.inputs.keys())
		if (/\.[cm]?[jt]sx?$/.test(file)) sources.read(relative(f.file(""), file));
	const planned = deriveSourceDelete(sources, { ...observed, generation: "test" });
	expect(source.slice(planned.selected.start, planned.selected.end)).toBe('<Counter key="a" name="A"/>');
	await f.select();
	await f.page.keyboard.press("Backspace");
	await expect.poll(() => readFileSync(f.file("frames/home/frame.tsx"), "utf8")).not.toContain('<Counter key="a"');
	await expect.poll(() => f.target.count()).toBe(0);
	expect(await sibling.textContent()).toBe("B:1");
	expect(await sibling.evaluate((element) => Reflect.get(window, "survivor") === element)).toBe(true);
	expect(f.writes).toEqual(["commit"]);
	await verified();
	const inverse = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
	);
	await f.history();
	await inverse;
	await verified();
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
	await expect.poll(() => f.target.textContent()).toBe("A:0");
	expect(await sibling.textContent()).toBe("B:1");
	expect(await sibling.evaluate((element) => Reflect.get(window, "survivor") === element)).toBe(true);
	const redo = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
	);
	await f.history(true);
	await redo;
	await verified();
	await expect.poll(() => f.target.count()).toBe(0);
	expect(await sibling.textContent()).toBe("B:1");
	expect(await sibling.evaluate((element) => Reflect.get(window, "survivor") === element)).toBe(true);
});

const carriers = [
	{
		name: "a special-name authored key",
		definition: "",
		a: '<Counter key="__proto__" name="A"/>',
		b: '<Counter key="constructor" name="B"/>',
		removed: "",
	},
	{
		name: "a supplied named slot",
		definition: "function Pass({header}){return <section>{header}</section>}",
		a: '<Pass key="a" header={<Counter name="A"/>}/>',
		b: '<Pass key="b" header={<Counter name="B"/>}/>',
		removed: '<Pass key="a" header={null}/>',
	},
	{
		name: "an authored fallback with neighboring output",
		definition: "function Pass({header}){return <section>{header ?? <i>Fallback</i>}<aside>Kept</aside></section>}",
		a: '<Pass key="a" header={<Counter name="A"/>}/>',
		b: '<Pass key="b" header={<Counter name="B"/>}/>',
		removed: '<Pass key="a" header={null}/>',
		fallback: true,
	},
	{
		name: "a conditional slot arm",
		definition: "const shown=true;function Pass({header}){return <section>{header}</section>}",
		a: '<Pass key="a" header={shown?<Counter name="A"/>:null}/>',
		b: '<Pass key="b" header={<Counter name="B"/>}/>',
		removed: '<Pass key="a" header={shown?null:null}/>',
	},
	{
		name: "a cloned child carrier",
		definition: "function Pass({children}){return cloneElement(children,{})}",
		a: '<Pass key="a"><Counter name="A"/></Pass>',
		b: '<Pass key="b"><Counter name="B"/></Pass>',
		removed: "",
	},
	{
		name: "a recreated child carrier",
		definition:
			"function Pass({children}){return createElement(children.type,{name:children.props.name,key:children.key})}",
		a: '<Pass key="a"><Counter name="A"/></Pass>',
		b: '<Pass key="b"><Counter name="B"/></Pass>',
		removed: "",
	},
	{
		name: "an array-copied child carrier",
		definition: "function Pass({children}){return Children.toArray(children)}",
		a: '<Pass key="a"><Counter name="A"/></Pass>',
		b: '<Pass key="b"><Counter name="B"/></Pass>',
		removed: '<Pass key="a"></Pass>',
	},
];

it.each(carriers)("retains source-owned Delete and inverse through $name", { timeout: 120000 }, async (carrier) => {
	const source = `import {cloneElement,createElement,Children} from 'react';${COMPONENTS}${carrier.definition}export default function Frame(){return <main style={{padding:40}}>${carrier.a}${carrier.b}</main>}`;
	const f = await originCanvas({}, source, '[data-name="A"]');
	const sourceResponses: unknown[] = [];
	f.page.on("response", async (response) => {
		if (response.url().endsWith("/source")) {
			const body = await response.json().catch(() => undefined);
			if (body?.ok === false) sourceResponses.push(body);
		}
	});
	const sibling = f.frame.locator('[data-name="B"]');
	await sibling.evaluate((element) => {
		(element as HTMLElement).click();
		Reflect.set(window, "survivor", element);
		Reflect.set(window, "kept", [...document.querySelectorAll("aside")]);
	});
	await expect.poll(() => sibling.textContent()).toBe("B:1");
	const assertSurvivors = async () => {
		expect(await sibling.textContent()).toBe("B:1");
		expect(await sibling.evaluate((element) => Reflect.get(window, "survivor") === element)).toBe(true);
		if ("fallback" in carrier) {
			expect(await f.frame.locator("aside").allTextContents()).toEqual(["Kept", "Kept"]);
			expect(
				await sibling.evaluate(() =>
					Reflect.get(window, "kept").every(
						(element: Element, i: number) => document.querySelectorAll("aside")[i] === element,
					),
				),
			).toBe(true);
		}
	};
	const delivered = () =>
		f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
		);
	const verified = async () => {
		await f.settled();
		const outcome = await f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1));
		expect(outcome, JSON.stringify(outcome)).toMatchObject({
			installation: "installed",
			rendered: "verified",
		});
	};
	await f.select();
	const commit = delivered();
	await f.page.keyboard.press("Backspace");
	await commit.catch(() => {
		throw new Error(JSON.stringify(sourceResponses));
	});
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source.replace(carrier.a, carrier.removed));
	await expect.poll(() => f.target.count()).toBe(0);
	await verified();
	await assertSurvivors();
	if ("fallback" in carrier) expect(await f.frame.locator("i").allTextContents()).toEqual(["Fallback"]);
	const undo = delivered();
	await f.history();
	await undo;
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
	await expect.poll(() => f.target.textContent()).toBe("A:0");
	await verified();
	await assertSurvivors();
	const redo = delivered();
	await f.history(true);
	await redo;
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source.replace(carrier.a, carrier.removed));
	await expect.poll(() => f.target.count()).toBe(0);
	await verified();
	await assertSurvivors();
});
