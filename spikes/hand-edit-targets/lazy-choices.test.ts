import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { type Mounted, mount, read, select, stillSelected } from "./automatic-browser";
import type { Operation } from "./automatic-source";

const evidence: Record<string, unknown> = {};
const roots: string[] = [];
let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	evidence.environment = {
		browser: browser.version(),
		react: JSON.parse(readFileSync("node_modules/react/package.json", "utf8")) as unknown,
		rendererSha256: createHash("sha256")
			.update(readFileSync("node_modules/react-dom/cjs/react-dom-client.production.js"))
			.digest("hex"),
	};
});
afterAll(async () => {
	await browser?.close();
	if (process.env.LAZY_CHOICE_EVIDENCE)
		writeFileSync(
			process.env.LAZY_CHOICE_EVIDENCE,
			JSON.stringify(
				evidence,
				(_key, value: unknown) =>
					typeof value === "string" ? roots.reduce((text, root) => text.replaceAll(root, "<project>"), value) : value,
				2,
			),
		);
});
function project(files: Record<string, string>) {
	const root = makeTempDir();
	roots.push(root);
	markProject(root);
	writeDesignFile(root, "shared/tokens.css", "");
	for (const [path, text] of Object.entries(files)) writeDesignFile(root, path, text);
	return root;
}
function supported(value: Awaited<ReturnType<typeof read>>) {
	if (value.kind !== "supported") throw new Error(value.reason);
	return value;
}
async function readAt(mounted: Mounted, selector: string, operation: Operation = { kind: "text" }) {
	return read(mounted, await select(mounted, selector), operation);
}
async function display(mounted: Mounted) {
	return mounted.page.evaluate(() => ({
		html: document.querySelector("#root")?.innerHTML,
		input: (document.querySelector("input") as HTMLInputElement | null)?.value,
		focus: document.activeElement?.id,
		refs: Reflect.get(globalThis, "refs") as unknown,
		reads: Reflect.get(globalThis, "reads") as unknown,
		lastSlot: Reflect.get(globalThis, "lastSlot") as unknown,
	}));
}
const leaf = `export function Button({label}){return <button className="p-4">{label}</button>} export {Button as default};`;

it("retains the executed module and export independently of equal names, labels and function values", async () => {
	const cases = [
		{
			name: "conditional module first",
			loader: `()=>globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other')`,
			module: "shared/ui/leaf.tsx",
			exported: "default",
		},
		{
			name: "conditional module second",
			loader: `()=>!globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other')`,
			module: "shared/ui/other.tsx",
			exported: "default",
		},
		{
			name: "conditional export first",
			loader: `()=>import('shared/ui/barrel').then(m=>({default:globalThis.choice?m.First:m.Second}))`,
			module: "shared/ui/barrel.ts",
			exported: "First",
		},
		{
			name: "conditional export second",
			loader: `()=>import('shared/ui/barrel').then(m=>({default:!globalThis.choice?m.First:m.Second}))`,
			module: "shared/ui/barrel.ts",
			exported: "Second",
			owner: "other.tsx",
		},
		{
			name: "equal value first binding",
			loader: `()=>import('shared/ui/barrel').then(m=>({default:globalThis.choice?m.First:m.Alias}))`,
			module: "shared/ui/barrel.ts",
			exported: "First",
		},
		{
			name: "equal value second binding",
			loader: `()=>import('shared/ui/barrel').then(m=>({default:!globalThis.choice?m.First:m.Alias}))`,
			module: "shared/ui/barrel.ts",
			exported: "Alias",
		},
		{
			name: "stored preserved",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};return result})`,
			module: "shared/ui/barrel.ts",
			exported: "First",
			owner: "leaf.tsx",
		},
		{
			name: "stored replaced",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=m.Second;return result})`,
			module: "shared/ui/barrel.ts",
			exported: "Second",
			owner: "other.tsx",
		},
		{
			name: "stored equal function replacement",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=m.Alias;return result})`,
			module: "shared/ui/barrel.ts",
			exported: "Alias",
			owner: "leaf.tsx",
		},
		{
			name: "aliased object replacement",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};const alias=result;alias.default=m.Second;return result})`,
			module: "shared/ui/barrel.ts",
			exported: "Second",
			owner: "other.tsx",
		},
		{
			name: "copy preserves earlier origin",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};const copy={...result};result.default=m.Alias;return copy})`,
			module: "shared/ui/barrel.ts",
			exported: "First",
			owner: "leaf.tsx",
		},
		{
			name: "copy retains replacement origin",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=m.Alias;const copy={...result};return copy})`,
			module: "shared/ui/barrel.ts",
			exported: "Alias",
			owner: "leaf.tsx",
		},
		{
			name: "projection from copied default",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.Second};const copy={default:result.default};return copy})`,
			module: "shared/ui/barrel.ts",
			exported: "Second",
			owner: "other.tsx",
		},
		{
			name: "later callback replacement",
			loader: `()=>import('shared/ui/barrel').then(m=>({default:m.First})).then(async result=>{const m=await import('shared/ui/barrel');result.default=m.Alias;return result})`,
			module: "shared/ui/barrel.ts",
			exported: "Alias",
			owner: "leaf.tsx",
		},
		{
			name: "later callback preserves copy",
			loader: `()=>import('shared/ui/barrel').then(m=>({default:m.First})).then(async result=>{const copy={...result};const m=await import('shared/ui/barrel');result.default=m.Second;return copy})`,
			module: "shared/ui/barrel.ts",
			exported: "First",
			owner: "leaf.tsx",
		},
		{
			name: "conditional copied default",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=globalThis.choice?m.Second:m.Alias;const copy={...result};return copy})`,
			module: "shared/ui/barrel.ts",
			exported: "Second",
			owner: "other.tsx",
		},
		{
			name: "namespace spread",
			loader: `()=>import('shared/ui/leaf').then(m=>({...m}))`,
			module: "shared/ui/leaf.tsx",
			exported: "default",
		},
		{
			name: "computed first",
			loader: `()=>import('./parts/'+globalThis.pick+'.tsx')`,
			module: "frames/home/parts/first.tsx",
			exported: "default",
			pick: "first",
		},
		{
			name: "computed second",
			loader: `()=>import('./parts/'+globalThis.pick+'.tsx')`,
			module: "frames/home/parts/second.tsx",
			exported: "default",
			pick: "second",
		},
		{
			name: "async preserved namespace",
			loader: `async()=>{globalThis.loads++;const m=await import('shared/ui/leaf');await Promise.resolve();return m}`,
			module: "shared/ui/leaf.tsx",
			exported: "default",
		},
		{
			name: "async projected replacement",
			loader: `async()=>{globalThis.loads++;const m=await import('shared/ui/barrel');await Promise.resolve();return {default:m.Second}}`,
			module: "shared/ui/barrel.ts",
			exported: "Second",
			owner: "other.tsx",
		},
		{
			name: "indirect resolved namespace",
			loader: `()=>Promise.resolve(globalThis.namespace)`,
			setup: `import * as UI from 'shared/ui/leaf';globalThis.namespace=UI;`,
			module: "shared/ui/leaf.tsx",
			exported: "default",
		},
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/leaf.tsx": leaf,
			"shared/ui/other.tsx": leaf,
			"shared/ui/barrel.ts": `export {Button as First} from './leaf';export {Button as Second} from './other';import {Button} from './leaf';export const Alias=Button;`,
			"frames/home/parts/first.tsx": leaf,
			"frames/home/parts/second.tsx": leaf,
			"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';${sample.setup ?? ""}globalThis.loads=0;globalThis.choice=true;globalThis.pick=${JSON.stringify(sample.pick ?? "first")};const Pick=lazy(${sample.loader});export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/><Pick label="Same"/></Suspense><input id="input" defaultValue="Kept"/></main>`,
		});
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "lazy-observed");
		await normal.page.locator("button").first().waitFor();
		await observed.page.locator("button").first().waitFor();
		expect(await display(observed), sample.name).toEqual(await display(normal));
		const first = supported(await readAt(observed, "button >> nth=0")),
			second = supported(await readAt(observed, "button >> nth=1"));
		expect(first.target.address.start, sample.name).not.toBe(second.target.address.start);
		expect(first.proof.selection.chain.find((c) => c.lazyChoice)?.lazyChoice).toMatchObject({
			module: sample.module,
			export: sample.exported,
		});
		const style = supported(
			await readAt(observed, "button >> nth=1", { kind: "property", property: "padding-top", scope: "" }),
		);
		expect(style.target.address.file).toContain(
			sample.owner ?? (sample.module.endsWith("barrel.ts") ? "leaf.tsx" : sample.module),
		);
		const deletion = supported(await readAt(observed, "button >> nth=1", { kind: "delete" }));
		const reorder = supported(await readAt(observed, "button >> nth=1", { kind: "reorder" }));
		expect(deletion.target.address).toEqual(second.target.address);
		expect(reorder.target.address).toEqual(second.target.address);
		outcomes.push({
			name: sample.name,
			first,
			second,
			style,
			deletion,
			reorder,
			loads: await observed.page.evaluate("globalThis.loads"),
		});
		await normal.page.close();
		await observed.page.close();
	}
	evidence.choices = outcomes;
}, 120000);

it("preserves state, refs, props, focus, input and single evaluation in both observer boundaries", async () => {
	const root = project({
		"shared/ui/leaf.tsx": `import {useState} from 'react';globalThis.initializers=(globalThis.initializers??0)+1;export function Button({label}){const [n,setN]=useState(0);globalThis.propsSeen=label;return <button className="p-4" onClick={()=>setN(n+1)} data-count={n} ref={node=>{globalThis.refs=node?.tagName??null}}>{label}</button>} export {Button as default};`,
		"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';globalThis.loads=0;globalThis.choice=true;const Pick=lazy(async()=>{globalThis.loads++;const m=await import('shared/ui/leaf');const result={default:m.default};const alias=result;alias.default=globalThis.choice?m.Button:m.default;const copy={...result};return copy});const initialize=Pick._init;globalThis.lazyInitializers=0;Pick._init=payload=>{globalThis.lazyInitializers++;return initialize(payload)};export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/><Pick label="Same"/></Suspense><input id="input" defaultValue="Kept"/></main>`,
	});
	const outcomes = [];
	for (const mode of ["lazy-observed", "lazy-reconciled"] as const) {
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", mode);
		for (const mounted of [normal, observed]) {
			await mounted.page.locator("button").first().waitFor();
			await mounted.page.locator("button").nth(1).click();
			await mounted.page.locator("input").fill("Typed");
		}
		const before = await display(observed);
		const initializerCount = await observed.page.evaluate("globalThis.lazyInitializers");
		const selection = await select(observed, "button >> nth=1");
		const text = await read(observed, selection, { kind: "text" });
		expect(text).toMatchObject({ kind: "refused", reason: "text is not a direct immutable parameter or literal" });
		const style = supported(await read(observed, selection, { kind: "property", property: "padding-top", scope: "" }));
		const deletion = supported(await read(observed, selection, { kind: "delete" }));
		expect(await display(observed)).toEqual(before);
		expect(before).toEqual(await display(normal));
		expect(await observed.page.locator("button").nth(1).getAttribute("data-count")).toBe("1");
		const counts = await observed.page.evaluate("({loads,initializers,propsSeen})");
		expect(initializerCount).toBeGreaterThan(0);
		expect(await observed.page.evaluate("globalThis.lazyInitializers")).toBe(initializerCount);
		expect(initializerCount).toBe(await normal.page.evaluate("globalThis.lazyInitializers"));
		expect(counts).toEqual({ loads: 1, initializers: 1, propsSeen: "Same" });
		expect(counts).toEqual(await normal.page.evaluate("({loads,initializers,propsSeen})"));
		outcomes.push({ mode, style, text, deletion, display: before, counts, initializerCount });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.behavior = outcomes;
});

it("refuses untracked escapes and getter consumption without replaying application code", async () => {
	const cases = [
		{
			name: "getter default",
			loader: `()=>import('shared/ui/leaf').then(m=>({get default(){globalThis.reads++;return m.Button}}))`,
		},
		{
			name: "later replacement",
			loader: `()=>import('shared/ui/barrel').then(m=>({default:m.First})).then(result=>{result.default=globalThis.other;return result})`,
		},
		{
			name: "getter member on arbitrary object",
			loader: `async()=>{const actual=await import('shared/ui/leaf');const fake={get Button(){globalThis.reads++;return actual.Button}};return {default:fake.Button}}`,
		},
		{
			name: "equal named local function",
			loader: `()=>import('shared/ui/leaf').then(m=>({default:globalThis.other}))`,
		},

		{
			name: "escaped alias replaces equal function",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};globalThis.saved=result;globalThis.saved.default=m.Alias;return result})`,
		},
		{
			name: "detached callback can change a consumed default",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};const pending=import('shared/ui/barrel').then(n=>{result.default=n.Alias;return result});return result})`,
		},
		{
			name: "unknown call mutates result",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};((r)=>{r.default=m.Alias})(result);return result})`,
		},
		{
			name: "descriptor installs getter",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};Object.defineProperty(result,'default',{get(){globalThis.reads++;return m.Alias}});return result})`,
		},
		{
			name: "getter spread has application reads",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={get default(){globalThis.reads++;return m.Alias}};return {...result}})`,
		},
		{
			name: "same function getter log changes after commit",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result={get default(){globalThis.reads++;globalThis.lastSlot=globalThis.after?'Alias':'First';return globalThis.after?m.Alias:m.First}};globalThis.afterCommit=()=>{globalThis.after=true;void result.default};return result})`,
		},
		{
			name: "proxy spread retains ordinary traps",
			loader: `()=>import('shared/ui/barrel').then(m=>{const result=new Proxy({default:m.First},{ownKeys(target){globalThis.reads++;return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){globalThis.reads++;return Reflect.getOwnPropertyDescriptor(target,key)},get(target,key,receiver){globalThis.reads++;return Reflect.get(target,key,receiver)}});return {...result}})`,
		},
		{
			name: "copied then export escapes during promise resolution",
			loader: `()=>import('shared/ui/thenable').then(m=>{globalThis.install++;const result={...m};result.default=m.default;return result})`,
		},
		{
			name: "proxy result descriptors",
			loader: `async()=>{const m=await import('shared/ui/leaf');const result=new Proxy({default:m.Button},{getOwnPropertyDescriptor(target,key){globalThis.reads++;return Reflect.getOwnPropertyDescriptor(target,key)}});return result}`,
		},
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/leaf.tsx": leaf,
			"shared/ui/other.tsx": leaf,
			"shared/ui/barrel.ts": `export {Button as First,Button as Alias} from './leaf';export {Button as Second} from './other';`,
			"shared/ui/thenable.ts": `import {Button} from './leaf';export {Button as default};let then;export {then};Object.defineProperty(globalThis,'install',{get(){return 0},set(){then=function(resolve){globalThis.reads++;delete this.then;this.default=Button;resolve(this)}}});`,
			"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';import {Button} from 'shared/ui/other';globalThis.other=Button;globalThis.reads=0;const Pick=lazy(${sample.loader});export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>`,
		});
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "lazy-observed");
		await normal.page.locator("button").waitFor();
		await observed.page.locator("button").waitFor();
		const beforeExtraRead = await display(observed);
		for (const mounted of [normal, observed]) await mounted.page.evaluate("globalThis.afterCommit?.()");
		if (sample.name === "same function getter log changes after commit") {
			expect(beforeExtraRead.lastSlot).toBe("First");
			expect((await display(observed)).lastSlot).toBe("Alias");
			expect((await display(observed)).html).toBe(beforeExtraRead.html);
		}
		const before = await display(observed),
			reads = [];
		for (const operation of [
			{ kind: "text" },
			{ kind: "delete" },
			{ kind: "reorder" },
			{ kind: "property", property: "padding-top", scope: "" },
		] as const) {
			const value = await readAt(observed, "button", operation);
			expect(value.kind, sample.name).toBe("refused");
			reads.push(value);
		}
		expect(await display(observed)).toEqual(before);
		expect(before).toEqual(await display(normal));
		outcomes.push({ name: sample.name, reads, beforeExtraRead, display: before });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.refusals = outcomes;
}, 60000);

it("keeps delayed, suspended and abandoned choices off the committed selection", async () => {
	const root = project({
		"shared/ui/leaf.tsx": leaf,
		"shared/ui/other.tsx": leaf,
		"frames/home/frame.tsx": `import {lazy,Suspense,startTransition,useState} from 'react';globalThis.loads=0;globalThis.choice=true;let finish;globalThis.gate=new Promise(resolve=>finish=resolve);globalThis.resolveGate=()=>finish();const Pick=lazy(async()=>{globalThis.loads++;const m=await (!globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other'));const result={default:m.default};await globalThis.gate;const copy={...result};return copy});export default function Frame(){const [next,setNext]=useState(false);globalThis.next=()=>startTransition(()=>setNext(true));globalThis.abandon=()=>setNext(false);return <main><Suspense fallback={<i>Waiting</i>}>{next?<Pick label="Candidate"/>:<button>Committed</button>}</Suspense><input id="input" defaultValue="Kept"/></main>}`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "lazy-observed");
	const old = supported(await readAt(observed, "button"));
	for (const mounted of [normal, observed]) {
		await mounted.page.locator("input").fill("Typed");
		await mounted.page.evaluate("next()");
	}
	await expect.poll(() => observed.page.evaluate("globalThis.loads")).toBe(1);
	await expect.poll(() => normal.page.evaluate("globalThis.loads")).toBe(1);
	const settle = (m: Mounted) =>
		m.page.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
	await settle(observed);
	await settle(normal);
	await expect(observed.page.locator('button:text-is("Candidate")').count()).resolves.toBe(0);
	await expect(stillSelected(observed, old.proof.selection)).resolves.toBe(true);
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("abandon()");
		await settle(mounted);
		await mounted.page.evaluate("resolveGate()");
		await settle(mounted);
	}
	expect(await observed.page.locator('button:text-is("Candidate")').count()).toBe(0);
	expect(await stillSelected(observed, old.proof.selection)).toBe(true);
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("next()");
		await mounted.page.locator('button:text-is("Candidate")').waitFor();
	}
	const committed = supported(
		await readAt(observed, "button", { kind: "property", property: "padding-top", scope: "" }),
	);
	expect(committed.target.address.file).toContain("other.tsx");
	expect(await stillSelected(observed, old.proof.selection)).toBe(false);
	expect(await observed.page.evaluate("globalThis.loads")).toBe(1);
	expect(await display(observed)).toEqual(await display(normal));
	evidence.delayed = {
		old,
		committed,
		suspendedUnselectable: true,
		abandonedUnselectable: true,
		loads: 1,
		display: await display(observed),
	};
	await normal.page.close();
	await observed.page.close();
});

it("retains two independent delayed choices after their condition changes", async () => {
	const root = project({
		"shared/ui/leaf.tsx": leaf,
		"shared/ui/other.tsx": leaf,
		"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';globalThis.choice=true;let first,second;globalThis.firstGate=new Promise(r=>first=r);globalThis.secondGate=new Promise(r=>second=r);globalThis.finishFirst=()=>first();globalThis.finishSecond=()=>second();const First=lazy(async()=>{const m=await (globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other'));const result={default:m.Button};await globalThis.firstGate;result.default=m.default;return {...result}});const Second=lazy(async()=>{const m=await (globalThis.choice?import('shared/ui/other'):import('shared/ui/leaf'));const result={default:m.Button};await globalThis.secondGate;result.default=m.default;return {...result}});export default ()=> <main><section id="first"><Suspense fallback={<i>Waiting</i>}><First label="Same"/></Suspense></section><section id="second"><Suspense fallback={<i>Waiting</i>}><Second label="Same"/></Suspense></section></main>`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "lazy-observed");
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("globalThis.choice=false;finishSecond()");
		await mounted.page.locator("#second button").waitFor();
	}
	const second = supported(
		await readAt(observed, "#second button", { kind: "property", property: "padding-top", scope: "" }),
	);
	expect(second.target.address.file).toContain("other.tsx");
	expect(await observed.page.locator("#first button").count()).toBe(0);
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("finishFirst()");
		await mounted.page.locator("#first button").waitFor();
	}
	const first = supported(
		await readAt(observed, "#first button", { kind: "property", property: "padding-top", scope: "" }),
	);
	expect(first.target.address.file).toContain("leaf.tsx");
	for (const value of [first, second])
		expect(value.proof.selection.chain.find((c) => c.lazyChoice)?.lazyChoice?.export).toBe("default");
	expect(await display(observed)).toEqual(await display(normal));
	expect(first.proof.selection.chain.find((c) => c.lazyChoice)?.lazyChoice?.loader.start).not.toBe(
		second.proof.selection.chain.find((c) => c.lazyChoice)?.lazyChoice?.loader.start,
	);
	evidence.concurrent = { first, second, display: await display(observed) };
	await normal.page.close();
	await observed.page.close();
});

it("recaptures the complete discovered graph before publishing any dynamic target", async () => {
	const root = project({
		"frames/home/parts/first.tsx": `export {default} from '../leaf';`,
		"frames/home/parts/second.tsx": leaf,
		"frames/home/leaf.tsx": leaf,
		"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';globalThis.pick='first';const Pick=lazy(async()=>{const m=await import('./parts/'+globalThis.pick+'.tsx');const result={default:m.default};return {...result}});export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>`,
	});
	const captures: string[][] = [];
	const authority = {
		async capture(revisions: readonly { path: string }[]) {
			captures.push(revisions.map((r) => r.path));
			return { epoch: "probe", handles: revisions.map((r) => ({ path: r.path, handle: r.path, revision: 1 })) };
		},
		async valid(lease: { handles: { path: string }[] }, revisions: readonly { path: string }[]) {
			return (
				lease.handles.length === revisions.length &&
				revisions.every((r) => lease.handles.some((h) => h.path === r.path))
			);
		},
	};
	const observed = await mount(browser, root, "home", "lazy-observed", authority);
	await observed.page.locator("button").waitFor();
	const accepted = supported(await readAt(observed, "button"));
	expect(captures).toHaveLength(2);
	expect(captures[0]).not.toContain("frames/home/parts/first.tsx");
	expect(captures[1]).toEqual(
		expect.arrayContaining(["frames/home/parts/first.tsx", "frames/home/parts/second.tsx", "frames/home/leaf.tsx"]),
	);
	expect(accepted.proof.admission.at(-1)?.discovered).toEqual([]);
	expect(accepted.proof.owner?.handles.map((h) => h.path).sort()).toEqual(
		accepted.proof.revisions.map((r) => r.path).sort(),
	);
	let calls = 0;
	const pages = browser.contexts().flatMap((c) => c.pages()).length;
	await expect(
		mount(browser, root, "home", "lazy-observed", {
			...authority,
			async capture(revisions) {
				if (++calls === 2) throw new Error("owner refused newly discovered inputs");
				return authority.capture(revisions);
			},
		}),
	).rejects.toThrow("owner refused newly discovered inputs");
	expect(browser.contexts().flatMap((c) => c.pages()).length).toBe(pages);
	writeDesignFile(root, "frames/home/parts/third.tsx", leaf);
	expect(await stillSelected(observed, accepted.proof.selection)).toBe(false);
	evidence.admission = {
		captures,
		accepted,
		newDirectoryMemberRetires: true,
		failedAdmissionCreatesNoDocument: true,
		limit: "structural authority double; same-process coordinator is exercised by the private companion",
	};
	await observed.page.close();
});

it("retires changed loader, caller, module, absent-path and generation witnesses", async () => {
	const outcomes = [];
	for (const cause of ["loader", "caller", "module", "absent-path", "generation"] as const) {
		const frame = `import {lazy,Suspense} from 'react';globalThis.choice=true;const Pick=lazy(()=>globalThis.choice?import('shared/ui/barrel'):import('shared/ui/other'));export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>`;
		const root = project({
			"shared/ui/leaf.tsx": leaf,
			"shared/ui/other.tsx": leaf,
			"shared/ui/barrel.ts": `export {default} from './leaf';`,
			"frames/home/frame.tsx": frame,
		});
		const observed = await mount(browser, root, "home", "lazy-observed");
		await observed.page.locator("button").waitFor();
		const before = supported(await readAt(observed, "button"));
		if (cause === "loader")
			writeDesignFile(
				root,
				"frames/home/frame.tsx",
				frame.replace("()=>globalThis.choice?", "()=>!globalThis.choice?"),
			);
		if (cause === "caller")
			writeDesignFile(root, "frames/home/frame.tsx", frame.replace('label="Same"', 'label="New"'));
		if (cause === "module") writeDesignFile(root, "shared/ui/barrel.ts", `export {default} from './other';`);
		if (cause === "absent-path") writeDesignFile(root, "shared/ui/barrel.tsx", `export {default} from './leaf';`);
		if (cause === "generation") observed.generation = "new-generation";
		expect(await stillSelected(observed, before.proof.selection)).toBe(false);
		const after = await read(observed, before.proof.selection, { kind: "text" });
		expect(after.kind).toBe("refused");
		outcomes.push({ cause, before, after });
		await observed.page.close();
	}
	evidence.retirement = outcomes;
});

it("refuses a runtime module outside the captured build even when its component source is observed", async () => {
	const root = project({
		"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';function Button({label}){return <button className="p-4">{label}</button>}globalThis.ExternalButton=Button;globalThis.moduleUrl='data:text/javascript,export default globalThis.ExternalButton';const Pick=lazy(async()=>{const m=await import(globalThis.moduleUrl);const result={default:m.default};return {...result}});export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "lazy-observed");
	await normal.page.locator("button").waitFor();
	await observed.page.locator("button").waitFor();
	const reads = [];
	for (const operation of [
		{ kind: "text" },
		{ kind: "delete" },
		{ kind: "property", property: "padding-top", scope: "" },
	] as const) {
		const value = await readAt(observed, "button", operation);
		expect(value).toMatchObject({
			kind: "refused",
			reason: "lazy resolved default has no preserved executed module/export origin",
		});
		reads.push(value);
	}
	expect(await display(observed)).toEqual(await display(normal));
	evidence.outsideBuild = { reads, admission: observed.admission, display: await display(observed) };
	await normal.page.close();
	await observed.page.close();
});

it("evaluates an accessor-backed namespace reference once and keeps that receiver's export origin", async () => {
	const root = project({
		"shared/ui/leaf.tsx": leaf.replace("className=", 'data-module="first" className='),
		"shared/ui/other.tsx": leaf.replace("className=", 'data-module="second" className='),
		"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';import * as First from 'shared/ui/leaf';import * as Second from 'shared/ui/other';globalThis.reads=0;Object.defineProperty(globalThis,'borrowed',{get(){return ++globalThis.reads===1?First:Second}});const Pick=lazy(async()=>({default:borrowed.Button}));export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "lazy-observed");
	await normal.page.locator("button").waitFor();
	await observed.page.locator("button").waitFor();
	const text = supported(await readAt(observed, "button"));
	const style = supported(await readAt(observed, "button", { kind: "property", property: "padding-top", scope: "" }));
	expect(style.target.address.file).toContain("leaf.tsx");
	expect(style.proof.selection.chain.find((c) => c.lazyChoice)?.lazyChoice?.module).toBe("shared/ui/leaf.tsx");
	expect(await observed.page.evaluate("globalThis.reads")).toBe(1);
	expect(await display(observed)).toEqual(await display(normal));
	evidence.receiver = { text, style, display: await display(observed) };
	await normal.page.close();
	await observed.page.close();
});

it("keeps a separately imported loader and a cyclic export route tied to their own revisions", async () => {
	const root = project({
		"shared/ui/leaf.tsx": leaf,
		"shared/ui/other.tsx": leaf,
		"shared/ui/cycle.ts": `export * from './barrel';`,
		"shared/ui/barrel.ts": `export * from './cycle';export * from './leaf';`,
		"shared/ui/deferred.ts": `import {lazy as deferred} from 'react';globalThis.choice=true;export const Pick=deferred(()=>globalThis.choice?import('./barrel').then(m=>{const result={default:m.Button};return {...result}}):import('./other'));`,
		"frames/home/frame.tsx": `import {Suspense} from 'react';import {Pick} from 'shared/ui/deferred';export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/><Pick label="Same"/></Suspense></main>`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "lazy-observed");
	await normal.page.locator("button").first().waitFor();
	await observed.page.locator("button").first().waitFor();
	const text = supported(await readAt(observed, "button >> nth=1"));
	const style = supported(
		await readAt(observed, "button >> nth=1", { kind: "property", property: "padding-top", scope: "" }),
	);
	expect(style.target.address.file).toContain("leaf.tsx");
	expect(style.proof.selection.chain.find((c) => c.lazyChoice)?.lazyChoice).toMatchObject({
		module: "shared/ui/barrel.ts",
		export: "Button",
		loader: { file: "shared/ui/deferred.ts" },
	});
	expect(style.proof.revisions.map((r) => r.path)).toEqual(
		expect.arrayContaining([
			"shared/ui/deferred.ts",
			"shared/ui/cycle.ts",
			"shared/ui/barrel.ts",
			"shared/ui/leaf.tsx",
			"shared/ui/other.tsx",
			"frames/home/frame.tsx",
		]),
	);
	expect(await display(observed)).toEqual(await display(normal));
	writeDesignFile(
		root,
		"shared/ui/deferred.ts",
		`import {lazy} from 'react';export const Pick=lazy(()=>import('./other'));`,
	);
	expect(await stillSelected(observed, style.proof.selection)).toBe(false);
	evidence.importedLoader = { text, style, changedLoaderRetires: true };
	await normal.page.close();
	await observed.page.close();
});
