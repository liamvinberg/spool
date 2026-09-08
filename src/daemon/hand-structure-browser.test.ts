import { readFileSync, rmSync } from "node:fs";
import { relative } from "node:path";
import { expect, it } from "vitest";
import { createFrameCompiler } from "./compile";
import { originCanvas } from "./hand-origin-browser-helpers";
import { Sources } from "./source-origins";
import { deriveSourceDelete } from "./source-structure";

function sourceReplies(page: Awaited<ReturnType<typeof originCanvas>>["page"]) {
	const replies: unknown[] = [];
	page.on("response", async (response) => {
		if (!response.url().endsWith("/source")) return;
		const result = await response.json().catch(() => undefined);
		if (result)
			replies.push({
				action: response.request().postDataJSON()?.action,
				ok: result.ok,
				reason: result.reason,
				source: result.source,
				publication: !!result.publication,
			});
	});
	return replies;
}

async function trackStructuralRetention(page: Awaited<ReturnType<typeof originCanvas>>["page"]) {
	await page.addInitScript(() => {
		const history: number[][] = [];
		Reflect.set(window, "structuralRetention", history);
		addEventListener("message", (event) => {
			if (event.data?.spool === "source-request" && event.data.action === "retain-structure")
				history.push(event.data.generations);
		});
	});
}

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
		name: "direct React factory components",
		definition: "",
		a: '{createElement(Counter,{key:"a",name:"A"})}',
		b: '{createElement(Counter,{key:"b",name:"B"})}',
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
	...[
		{ name: "a retained plain child", body: "children", removed: '<Pass key="a"></Pass>' },
		{ name: "a retained cloned child", body: "cloneElement(children,{})", removed: "" },
		{ name: "a retained overriding clone", body: "cloneElement(children,{name:children.props.name})", removed: "" },
		{
			name: "a retained recreated child",
			body: "createElement(children.type,{name:children.props.name,key:children.key})",
			removed: "",
		},
	].map(({ name, body, removed }) => ({
		name,
		definition: `const RetainedCounter=memo(Counter,()=>true);function Pass({children}){return ${body}}`,
		a: '<Pass key="a"><RetainedCounter name="A"/></Pass>',
		b: '<Pass key="b"><RetainedCounter name="B"/></Pass>',
		removed,
		retained: true,
	})),
];

it.each(carriers)("retains source-owned Delete and inverse through $name", { timeout: 120000 }, async (carrier) => {
	const source = `import {cloneElement,createElement,Children,memo} from 'react';${COMPONENTS}${carrier.definition}export default function Frame(){const [,tick]=useState(0);window.advance=()=>tick(n=>n+1);return <main style={{padding:40}}>${carrier.a}${carrier.b}</main>}`;
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
	if ("retained" in carrier) {
		await sibling.evaluate(() => Reflect.get(window, "advance")());
		await expect
			.poll(() =>
				f.target.evaluate((element) =>
					globalThis.__SPOOL_OBSERVER__.observe(element).chain.some((call) => call.retainedProps),
				),
			)
			.toBe(true);
	}
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

it.each([false, true])(
	"deletes one shared inner child across all original uses (two frames: %s)",
	{ timeout: 120000 },
	async (twoFrames) => {
		const removed = '<button key="remove" data-remove="">Remove</button>';
		const component = `import {useState} from 'react';export function Pair(){const [count,setCount]=useState(0);return <section>${removed}<input key="input" defaultValue="initial"/><button key="keep" data-keep="" onClick={()=>setCount(count+1)}>Kept:{count}</button></section>}`;
		const source =
			'import {Pair} from "../../shared/pair";export default function Frame(){return <main style={{padding:40}}><Pair key="a"/><Pair key="b"/></main>}';
		const f = await originCanvas({ "shared/pair.tsx": component }, source, "[data-remove]", twoFrames);
		const frames = [f.frame, ...(twoFrames ? [f.page.frameLocator('iframe[title="second"]')] : [])];
		for (const frame of frames) {
			await expect.poll(() => frame.locator("[data-keep]").count()).toBe(2);
			await frame.locator("main").evaluate((element) => {
				for (const button of element.querySelectorAll<HTMLElement>("[data-keep]")) button.click();
				for (const input of element.querySelectorAll("input")) {
					input.value = "dirty uncontrolled";
					input.setSelectionRange(2, 5);
				}
				Reflect.set(window, "survivingNodes", [...element.querySelectorAll("section,input,[data-keep]")]);
			});
			await expect.poll(() => frame.locator("[data-keep]").allTextContents()).toEqual(["Kept:1", "Kept:1"]);
		}
		await f.select();
		const requested = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
		);
		const delivered = () =>
			f.page.waitForResponse(
				(response) =>
					response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
			);
		const reached = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "reach",
		);
		const commit = delivered();
		await f.page.keyboard.press("Backspace");
		const read = await (await requested).json();
		expect(read).toMatchObject({
			ok: true,
			read: { operation: { kind: "delete" }, role: "structural-unit", scope: "definition" },
		});
		await commit;
		const reach = await (await reached).json();
		expect(reach.read.reach.uses).toHaveLength(twoFrames ? 4 : 2);
		const unchanged = async (present: boolean) => {
			await f.settled();
			const outcomes = await f.page.evaluate(() => Reflect.get(window, "originOutcomes"));
			for (const outcome of outcomes.slice(-frames.length)) {
				expect(outcome).toMatchObject({ installation: "installed", rendered: "verified" });
				expect(outcome.uses).toHaveLength(2);
				expect(new Set(outcome.uses.map((use: { occurrence: string }) => use.occurrence)).size).toBe(2);
			}
			for (const frame of frames) {
				await expect.poll(() => frame.locator("[data-remove]").count()).toBe(present ? 2 : 0);
				expect(await frame.locator("[data-keep]").allTextContents()).toEqual(["Kept:1", "Kept:1"]);
				expect(
					await frame
						.locator("main")
						.evaluate((element) =>
							Reflect.get(window, "survivingNodes").every(
								(node: Element, i: number) => element.querySelectorAll("section,input,[data-keep]")[i] === node,
							),
						),
				).toBe(true);
				expect(
					await frame.locator("input").evaluateAll((elements) =>
						elements.map((input) => {
							if (!(input instanceof HTMLInputElement)) throw new Error("expected input");
							return [input.value, input.selectionStart, input.selectionEnd];
						}),
					),
				).toEqual([
					["dirty uncontrolled", 2, 5],
					["dirty uncontrolled", 2, 5],
				]);
			}
			expect(readFileSync(f.file("shared/pair.tsx"), "utf8")).toBe(
				present ? component : component.replace(removed, ""),
			);
			expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
		};
		await unchanged(false);
		const undo = delivered();
		await f.history();
		await undo;
		await unchanged(true);
		const redo = delivered();
		await f.history(true);
		await redo;
		await unchanged(false);
	},
);

it.each([
	{ name: "unkeyed stateful siblings", children: '<Counter name="A"/><Counter name="B"/>', setup: "" },
	{
		name: "duplicate authored sibling keys",
		children: '<Counter key="same" name="A"/><Counter key="same" name="B"/>',
		setup: "",
	},
	{
		name: "a spread key boundary",
		children: '<Counter {...props} name="A"/><Counter key="b" name="B"/>',
		setup: 'const props={key:"a"};',
	},
	{ name: "data-generated rows", children: '{["A","B"].map(name=><Counter key={name} name={name}/>)}', setup: "" },
])("refuses $name before writing source", { timeout: 120000 }, async ({ children, setup }) => {
	const source = `${COMPONENTS}${setup}export default function Frame(){return <main style={{padding:40}}>${children}</main>}`;
	const f = await originCanvas({}, source, '[data-name="A"]');
	await f.select();
	await f.page.keyboard.press("Backspace");
	await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(1);
	expect(f.writes).toEqual([]);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
	expect(await f.target.textContent()).toBe("A:0");
	expect(await f.frame.locator('[data-name="B"]').textContent()).toBe("B:0");
	await f.page.getByRole("button", { name: "Dismiss notice", exact: true }).click();
	await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').count()).toBe(0);
	expect(f.writes).toEqual([]);
});

it("restores and removes the shared source after its initiating consumer is deleted", { timeout: 120000 }, async () => {
	const removed = '<b key="remove" data-remove="">Remove</b>';
	const shared = `export function Pair(){return <section>${removed}<i key="kept">Kept</i></section>}`;
	const source =
		'import {Pair} from "../../shared/pair";export default function Frame(){return <main style={{padding:40}}><Pair/></main>}';
	const f = await originCanvas({ "shared/pair.tsx": shared }, source, "[data-remove]");
	await f.select();
	const saved = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
	);
	await f.page.keyboard.press("Backspace");
	await saved;
	await f.settled();
	expect(readFileSync(f.file("shared/pair.tsx"), "utf8")).toBe(shared.replace(removed, ""));
	rmSync(f.file("frames/home"), { recursive: true });
	await expect.poll(() => f.page.locator('iframe[title="home"]').count()).toBe(0);
	for (const redo of [false, true, false]) {
		const response = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "inverse",
		);
		await f.history(redo);
		expect(await (await response).json()).toMatchObject({
			ok: true,
			source: "saved",
			publication: null,
			receipt: { operation: { kind: "delete" } },
		});
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		expect(readFileSync(f.file("shared/pair.tsx"), "utf8")).toBe(redo ? shared.replace(removed, "") : shared);
	}
});

it("deletes a shared clone replacement field while preserving its original supplied inputs", {
	timeout: 120000,
}, async () => {
	const replacement = "<Counter name={children.props.name}/>";
	const source = `import {cloneElement} from 'react';${COMPONENTS}function Slot({header}){return <section>{header}<aside>Kept</aside></section>}function Pass({children}){return cloneElement(children,{header:${replacement}})}export default function Frame(){return <main style={{padding:40}}><Pass key="a"><Slot name="A" header={<Counter name="Original A"/>}/></Pass><Pass key="b"><Slot name="B" header={<Counter name="Original B"/>}/></Pass></main>}`;
	const f = await originCanvas({}, source, '[data-name="A"]');
	await f.frame
		.locator("main")
		.evaluate((element) => Reflect.set(window, "kept", [...element.querySelectorAll("section,aside")]));
	await f.select();
	const replies = sourceReplies(f.page);
	const delivered = () =>
		f.page
			.waitForResponse(
				(response) =>
					response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
			)
			.catch((error) => {
				throw new Error(`${error}: ${JSON.stringify(replies)}`);
			});
	const commit = delivered();
	await f.page.keyboard.press("Backspace");
	await commit;
	const checked = async (present: boolean) => {
		await f.settled();
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(
			present ? source : source.replace(replacement, "null"),
		);
		expect(await f.frame.locator("[data-name]").allTextContents()).toEqual(present ? ["A:0", "B:0"] : []);
		expect(await f.frame.locator("aside").allTextContents()).toEqual(["Kept", "Kept"]);
		expect(
			await f.frame
				.locator("main")
				.evaluate((element) =>
					Reflect.get(window, "kept").every(
						(node: Element, i: number) => element.querySelectorAll("section,aside")[i] === node,
					),
				),
		).toBe(true);
		const outcome = await f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1));
		expect(outcome, JSON.stringify(outcome)).toMatchObject({ installation: "installed", rendered: "verified" });
		expect(outcome.uses).toHaveLength(2);
	};
	await checked(false);
	const undo = delivered();
	await f.history();
	await undo;
	await checked(true);
	const redo = delivered();
	await f.history(true);
	await redo;
	await checked(false);
});

it("keeps two structural deletes reversible in source history without remounting the remaining sibling", {
	timeout: 120000,
}, async () => {
	const a = '<Counter key="a" name="A"/>',
		b = '<Counter key="b" name="B"/>',
		c = '<Counter key="c" name="C"/>';
	const source = `${COMPONENTS}export default function Frame(){return <main style={{padding:40}}>${a}${b}${c}</main>}`;
	const f = await originCanvas({}, source, "[data-name]", false, trackStructuralRetention);
	const survivor = f.frame.locator('[data-name="C"]');
	await survivor.evaluate((element) => {
		(element as HTMLElement).click();
		Reflect.set(window, "survivor", element);
	});
	await expect.poll(() => survivor.textContent()).toBe("C:1");
	const replies = sourceReplies(f.page);
	const delivered = () =>
		f.page
			.waitForResponse(
				(response) =>
					response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
			)
			.catch((error) => {
				throw new Error(`${error}: ${JSON.stringify(replies)}`);
			});
	const checked = async (expected: string) => {
		await f.settled();
		expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(expected);
		expect(await survivor.textContent()).toBe("C:1");
		expect(await survivor.evaluate((element) => Reflect.get(window, "survivor") === element)).toBe(true);
		const outcome = await f.page.evaluate(() => Reflect.get(window, "originOutcomes").at(-1));
		expect(outcome, JSON.stringify(outcome)).toMatchObject({ installation: "installed", rendered: "verified" });
	};
	for (const expected of [source.replace(a, ""), source.replace(a, "").replace(b, "")]) {
		await f.select();
		const saved = delivered();
		await f.page.keyboard.press("Backspace");
		await saved;
		await checked(expected);
	}
	for (const [redo, expected] of [
		[false, source.replace(a, "")],
		[false, source],
		[true, source.replace(a, "")],
		[true, source.replace(a, "").replace(b, "")],
	] as const) {
		const inverse = delivered();
		await f.history(redo);
		await inverse;
		await checked(expected);
	}
	const retained = await survivor.evaluate(() => Reflect.get(window, "structuralRetention").at(-1) as number[]);
	expect(retained).toHaveLength(2);
	const undoB = delivered();
	await f.history();
	await undoB;
	await checked(source.replace(a, ""));
	await f.select();
	const newBranch = delivered();
	await f.page.keyboard.press("Backspace");
	await newBranch;
	await checked(source.replace(a, "").replace(b, ""));
	const replacement = await survivor.evaluate(() => Reflect.get(window, "structuralRetention").at(-1) as number[]);
	expect(replacement).toHaveLength(2);
	expect(replacement).toContain(retained[0]);
	expect(replacement).not.toContain(retained[1]);
	for (const expected of [source.replace(a, ""), source]) {
		const inverse = delivered();
		await f.history();
		await inverse;
		await checked(expected);
	}
});

it("discloses a potentially affected stale structural inventory without admitting its occurrence", {
	timeout: 120000,
}, async () => {
	const removed = '<button key="remove" data-remove="">Remove</button>';
	const component = `export function Pair(){return <section>${removed}<input key="keep" defaultValue="kept"/></section>}`;
	const source =
		'import {Pair} from "../../shared/pair";export default function Frame(){return <main style={{padding:40}}><Pair/></main>}';
	const f = await originCanvas({ "shared/pair.tsx": component }, source, "[data-remove]", true, async (page) => {
		await page.route("**/source", async (route) => {
			const request = route.request();
			const body = request.postDataJSON();
			if (body?.action === "reach")
				for (const inventory of body.inventories)
					if (inventory.frame === "second")
						for (const use of inventory.uses) use.original.publication = "retired-original-publication";
			await route.continue({ postData: JSON.stringify(body) });
		});
	});
	await expect.poll(() => f.page.frameLocator('iframe[title="second"]').locator("[data-remove]").count()).toBe(1);
	await f.select();
	const reach = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "reach",
	);
	const replies = sourceReplies(f.page);
	await f.page.keyboard.press("Backspace");
	const reached = await (await reach).json();
	expect(reached).toMatchObject({ ok: true, read: { reach: { unknown: expect.arrayContaining(["second"]) } } });
	expect(reached.read.reach.uses.every((use: { frame: string }) => use.frame === "home")).toBe(true);
	expect(reached.read.reach.unverified).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ frame: "second", occurrence: "", installation: "refused", rendered: "unverified" }),
		]),
	);
	await expect
		.poll(() =>
			replies.some(
				(reply) => !!reply && typeof reply === "object" && "action" in reply && reply.action === "delivered",
			),
		)
		.toBe(true);
	expect(readFileSync(f.file("shared/pair.tsx"), "utf8")).toBe(component.replace(removed, ""));
	await expect.poll(() => f.target.count()).toBe(0);
	expect(f.writes).toEqual(["commit"]);
});

it("keeps Backspace native in a focused input and textarea while an authored element is selected", {
	timeout: 120000,
}, async () => {
	const source = `${COMPONENTS}export default function Frame(){return <main style={{padding:40}}><Counter key="a" name="A"/><input key="input" defaultValue="abcd"/><textarea key="area" defaultValue="abcd"/></main>}`;
	const f = await originCanvas({}, source, '[data-name="A"]');
	await f.select();
	for (const tag of ["input", "textarea"]) {
		const field = f.frame.locator(tag);
		await field.evaluate((element) => {
			if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
				throw new Error("not a native field");
			element.focus();
			element.setSelectionRange(2, 2);
		});
		await f.page.keyboard.press("Backspace");
		await expect.poll(() => field.inputValue()).toBe("acd");
		expect(await field.evaluate((element) => document.activeElement === element)).toBe(true);
	}
	expect(await f.target.textContent()).toBe("A:0");
	expect(f.writes).toEqual([]);
	expect(readFileSync(f.file("frames/home/frame.tsx"), "utf8")).toBe(source);
});

it("resends actual source-history retention when a frame reloads with the same history", {
	timeout: 120000,
}, async () => {
	const source = `${COMPONENTS}export default function Frame(){return <main style={{padding:40}}><Counter key="a" name="A"/><Counter key="b" name="B"/></main>}`;
	const f = await originCanvas({}, source, '[data-name="A"]', false, trackStructuralRetention);
	await f.select();
	const delivered = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
	);
	await f.page.keyboard.press("Backspace");
	await delivered;
	await f.settled();
	const kept = f.frame.locator('[data-name="B"]');
	const generations = await kept.evaluate(() => Reflect.get(window, "structuralRetention").at(-1) as number[]);
	expect(generations).toHaveLength(1);
	await kept.evaluate(() => location.reload());
	await expect.poll(() => kept.evaluate(() => Reflect.get(window, "structuralRetention").at(-1))).toEqual(generations);
	expect(f.writes).toEqual(["commit"]);
});
