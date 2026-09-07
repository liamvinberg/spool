import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { type Mounted, mount, type ReadLease, read, select, stillSelected } from "./automatic-browser";
import { address, type Operation, reach } from "./automatic-source";
import { installObserver } from "./observer";

const evidence: Record<string, unknown> = {};
const roots: string[] = [];
let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	evidence.environment = {
		react: JSON.parse(readFileSync("node_modules/react/package.json", "utf8")) as unknown,
		renderer: "react-dom/client production",
		rendererSha256: createHash("sha256")
			.update(readFileSync("node_modules/react-dom/cjs/react-dom-client.production.js"))
			.digest("hex"),
		browser: browser.version(),
	};
});
afterAll(async () => {
	await browser?.close();
	if (process.env.CONTINUITY_EVIDENCE)
		writeFileSync(
			process.env.CONTINUITY_EVIDENCE,
			JSON.stringify(
				evidence,
				(_key, value: unknown) =>
					typeof value === "string"
						? roots.reduce((text, root) => text.replaceAll(root, "<project>"), value)
						: value,
				2,
			),
		);
});
function project(files: Record<string, string>) {
	const root = makeTempDir();
	markProject(root);
	roots.push(root);
	writeDesignFile(root, "shared/tokens.css", "");
	for (const [path, source] of Object.entries(files)) writeDesignFile(root, path, source);
	return root;
}
function supported(result: Awaited<ReturnType<typeof read>>) {
	if (result.kind !== "supported") throw new Error(result.reason);
	return result;
}
async function result(mounted: Mounted, selector: string, operation: Operation = { kind: "text" }) {
	return read(mounted, await select(mounted, selector), operation);
}
async function display(mounted: Mounted) {
	return mounted.page.evaluate(() => ({
		text: document.querySelector("#root")?.textContent,
		input: (document.querySelector("input") as HTMLInputElement | null)?.value,
		focus: document.activeElement?.id,
		refs: Reflect.get(globalThis, "refs") as unknown,
		contract: Reflect.get(globalThis, "contract") as unknown,
	}));
}

// Diagnostic only. It reads the pinned private renderer fields to falsify the
// props join; none of these values can be supplied to the target reader.
async function memoWitness(mounted: Mounted) {
	return mounted.page
		.locator("button")
		.first()
		.evaluate((host) => {
			interface Fiber {
				tag: number;
				elementType: unknown;
				memoizedProps: unknown;
				pendingProps: unknown;
				stateNode: unknown;
				child: Fiber | null;
				sibling: Fiber | null;
				return: Fiber | null;
			}
			interface Element {
				type: unknown;
				props: unknown;
			}
			const first = Reflect.get(globalThis, "firstCall") as Element;
			const latest = Reflect.get(globalThis, "latestCall") as Element;
			const key = Object.keys(host).find((name) => name.startsWith("__reactFiber$"));
			if (!key) throw new Error("pinned host Fiber is unavailable");
			let fiber = Reflect.get(host, key) as Fiber | null;
			while (fiber?.return) fiber = fiber.return;
			if (fiber?.tag !== 3) throw new Error("pinned host root is unavailable");
			const root = fiber.stateNode as { current: Fiber };
			const find = (current: Fiber | null, parents: readonly Fiber[]): readonly Fiber[] | undefined => {
				if (!current) return undefined;
				if (current.stateNode === host) return [...parents, current];
				return find(current.child, [...parents, current]) ?? find(current.sibling, parents);
			};
			const path = find(root.current, []);
			if (!path) throw new Error("host is absent from the committed root");
			const records = [];
			for (const current of path) {
				if ([14, 15].includes(current.tag))
					records.push({
						tag: current.tag,
						memoizedIsFirst: current.memoizedProps === first.props,
						pendingIsFirst: current.pendingProps === first.props,
						memoizedIsLatest: current.memoizedProps === latest.props,
						pendingIsLatest: current.pendingProps === latest.props,
						typeIsLatest: current.elementType === latest.type,
					});
			}
			return { distinctIncomingElement: first !== latest, fromCommittedRoot: true, records };
		});
}

it("falsifies the equal-prop memo join through call switches and local state without changing React", async () => {
	const outcomes = [];
	for (const comparator of ["", ", () => true"]) {
		const root = project({
			"frames/home/frame.tsx": `import {memo,useState,useRef,useEffect} from 'react';
function Button({label}) { const [n,setN]=useState(0);globalThis.increment=()=>setN(n+1);const ref=useRef(null);useEffect(()=>{globalThis.refs=ref.current?.tagName},[]);return <button ref={ref}>{label}<b>{n}</b></button> }
const Memo=memo(Button${comparator});
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(!flip);
const call=flip ? <Memo label="Same"/> : <Memo label="Same"/>;
globalThis.firstCall??=call;globalThis.latestCall=call;globalThis.contract={type:call.type===Memo,keys:Object.keys(call.props),label:call.props.label};
return <main>{call}<input id="input" defaultValue="Kept"/></main>}`,
		});
		const normal = await mount(browser, root, "home", false);
		const observed = await mount(browser, root, "home", "observed");
		const initial = await memoWitness(observed);
		const before = await select(observed, "button");
		const steps = [];
		for (const action of ["flip()", "increment()", "flip()", "rerender()"]) {
			for (const mounted of [normal, observed]) {
				await mounted.page.locator("input").fill("Typed");
				await mounted.page.evaluate(action);
				await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
			}
			expect(await display(observed)).toEqual(await display(normal));
			const witness = await memoWitness(observed);
			expect(witness.distinctIncomingElement).toBe(true);
			if (comparator === "") {
				expect(witness.records).toHaveLength(1);
				expect(witness.records[0]).toMatchObject({
					memoizedIsFirst: true,
					pendingIsFirst: true,
					memoizedIsLatest: false,
					pendingIsLatest: false,
					typeIsLatest: true,
				});
			}
			const reads = [];
			for (const operation of [
				{ kind: "text" },
				{ kind: "delete" },
				{ kind: "property", property: "padding-top", scope: "" },
			] as const) {
				const value = await result(observed, "button", operation);
				expect(value).toMatchObject({ kind: "refused", reason: expect.stringContaining("memo source continuity") });
				reads.push({ operation, value });
			}
			expect((await select(observed, "button")).occurrence).toBe(before.occurrence);
			steps.push({ action, witness, reads, display: await display(observed) });
		}
		outcomes.push({ comparator: comparator || "default", initial, steps });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.memo = outcomes;
}, 30000);

it("separates lexical targets from proven children transport and retains all dependency witnesses", async () => {
	const files = {
		"shared/ui/button.tsx": `export function Button({label}) {return <button className="p-4">{label}</button>}`,
		"shared/ui/pass.tsx": `export const Pass=({children})=>children; export const Box=props=><section className="block">{props.children}</section>;`,
		"shared/ui/group.tsx": `import {Button} from './button';import {Pass,Box} from './pass';export function Group({label}){return <div><Box><Pass><Button label={label}/></Pass></Box><Pass><Button label="Same"/><Button label="Same"/></Pass></div>}`,
		"frames/home/frame.tsx": `import {Group} from 'shared/ui/group';import {Pass} from 'shared/ui/pass';export default function Frame(){return <main><Group label="Same"/><Group label="Same"/><Pass><strong>Literal</strong></Pass></main>}`,
	};
	const root = project(files);
	const lease: ReadLease = {
		epoch: "disposable-owner",
		handles: [],
	};
	let admitted = true;
	const observed = await mount(browser, root, "home", "observed", {
		capture: async (revisions) => {
			lease.handles = revisions.map(({ path }, index) => ({ path, handle: `source-${index}`, revision: 1 }));
			return lease;
		},
		valid: async (held, revisions) =>
			admitted &&
			held === lease &&
			revisions.length === lease.handles.length &&
			revisions.every(({ path }) => lease.handles.some((handle) => handle.path === path)),
	});
	const normal = await mount(browser, root, "home", false);
	expect(await display(observed)).toEqual(await display(normal));
	const first = supported(await result(observed, "button >> nth=0"));
	const second = supported(await result(observed, "button >> nth=3"));
	expect(first.target.expected).toBe("Same");
	expect(first.target.role).toBe("call-site");
	expect(first.target.address.file).toContain("frames/home/frame.tsx");
	expect(first.target.address.start).not.toBe(second.target.address.start);
	const siblings = await Promise.all(
		[1, 2].map(async (index) => supported(await result(observed, `button >> nth=${index}`))),
	);
	expect(siblings[0]?.target.address.start).not.toBe(siblings[1]?.target.address.start);
	expect(siblings[0]?.target.address.file).toContain("shared/ui/group.tsx");
	const style = supported(
		await result(observed, "button >> nth=0", { kind: "property", property: "padding-top", scope: "" }),
	);
	expect(style.target.role).toBe("definition");
	expect(style.target.address.file).toContain("shared/ui/button.tsx");
	expect(style.target.scope).toBe("");
	expect(style.property?.owner?.token).toBe("p-4");
	const deletion = supported(await result(observed, "button >> nth=1", { kind: "delete" }));
	const reorder = supported(await result(observed, "button >> nth=1", { kind: "reorder" }));
	expect(deletion.target.role).toBe("call-site");
	expect(deletion.target.expected).toBe('<Button label="Same"/>');
	expect(reorder.target.address).toEqual(deletion.target.address);
	const literal = supported(await result(observed, "strong"));
	expect(literal.target.role).toBe("definition");
	expect(first.proof.revisions.map((revision) => revision.path)).toEqual(
		expect.arrayContaining([...Object.keys(files), "shared/tokens.css"]),
	);
	expect(first.proof.selection.chain.filter((call) => call.passedChild)).toHaveLength(2);
	expect(first.proof.owner).toEqual(lease);
	expect(first.proof.selection.generation).toBe(observed.generation);
	expect(first.proof.committedRender).toBeGreaterThan(0);
	admitted = false;
	expect(await stillSelected(observed, first.proof.selection)).toBe(false);
	admitted = true;
	writeDesignFile(root, "shared/ui/pass.tsx", `${files["shared/ui/pass.tsx"]}\n// changed carrier`);
	expect(await stillSelected(observed, first.proof.selection)).toBe(false);
	evidence.transport = {
		first,
		second,
		siblings,
		style,
		deletion,
		reorder,
		literal,
		ownerRetirement: true,
		carrierRevisionRetirement: true,
		authority: "synthetic owner seam only; real admission remains separate",
	};
	await normal.page.close();
	await observed.page.close();
});

it("tracks changed direct call relationships while preserving state, repeated reach and named structural refusals", async () => {
	const root = project({
		"shared/ui/button.tsx": `export const Button=({label})=><button className="p-4">{label}</button>;`,
		"shared/ui/pass.tsx": `export const Pass=({children})=>children;`,
		"frames/home/frame.tsx": `import {useState} from 'react';import {Button} from 'shared/ui/button';import {Pass} from 'shared/ui/pass';export default function Frame(){const [flip,setFlip]=useState(false);const [n,setN]=useState(0);globalThis.flip=()=>setFlip(!flip);globalThis.increment=()=>setN(n+1);return <main><i>{n}</i><Pass>{flip?<Button label="Same"/>:<Button label="Same"/>}</Pass>{[1,2].map(id=><Pass key={id}><Button label="Same"/></Pass>)}<input id="input" defaultValue="Kept"/></main>}`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed");
	// Conditional JSX is deliberately outside the direct-child bridge. Equal
	// text and retained DOM identity never turn it into a local source target.
	const initial = await result(observed, "button >> nth=0");
	expect(initial.kind).toBe("refused");
	const repeated = supported(
		await result(observed, "button >> nth=1", { kind: "property", property: "padding-top", scope: "" }),
	);
	expect(repeated.target.repeated).toBe(true);
	const steps = [];
	for (const action of ["increment()", "flip()", "flip()"]) {
		for (const mounted of [normal, observed]) {
			await mounted.page.locator("input").fill("Typed");
			await mounted.page.evaluate(action);
			await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
		}
		expect(await display(observed)).toEqual(await display(normal));
		const refusal = await result(observed, "button >> nth=0", { kind: "delete" });
		expect(refusal.kind).toBe("refused");
		steps.push({ action, refusal, display: await display(observed) });
	}
	evidence.changedTransport = { initial, repeated, steps };
	await normal.page.close();
	await observed.page.close();
});

it("refuses cloned, cached, named and unobserved slot values without inventing local targets", async () => {
	const cases = [
		{
			name: "clone retains identical label",
			body: `return cloneElement(children,{label:'Same'})`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{
			name: "clone changes label",
			body: `return cloneElement(children,{label:'Changed'})`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{
			name: "clone changes type through an unobserved call",
			body: `return createElement(children.type,{label:'Same'})`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{
			name: "cached first child reused by second instance",
			body: `globalThis.savedChild??=children;return globalThis.savedChild`,
			call: `<><Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass></>`,
		},
		{
			name: "children converted to keyed clones",
			body: `return Children.toArray(children)`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{ name: "named slot", body: `return header`, call: `<Pass header={<Button label="Same"/>}/>` },
		{ name: "unobserved component call", body: `return children`, call: `{createElement(Button,{label:'Same'})}` },
		{ name: "unobserved host call", body: `return children`, call: `{createElement('button',{},'Same')}` },
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"frames/home/frame.tsx": `import {Children,cloneElement,createElement,useState} from 'react';function Button({label}){return <button className="p-4">{label}</button>}function Pass({children,header}){${sample.body}}export default function Frame(){const [n,setN]=useState(0);globalThis.increment=()=>setN(n+1);return <main><i>{n}</i>${sample.call}<input id="input" defaultValue="Kept"/></main>}`,
		});
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "observed");
		const steps = [];
		for (const action of [null, "increment()"]) {
			if (action)
				for (const mounted of [normal, observed]) {
					await mounted.page.locator("input").fill("Typed");
					await mounted.page.evaluate(action);
					await mounted.page.evaluate(
						() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
					);
				}
			expect(await display(observed), sample.name).toEqual(await display(normal));
			const reads = [];
			for (let index = 0; index < (await observed.page.locator("button").count()); index++)
				for (const operation of [
					{ kind: "text" },
					{ kind: "delete" },
					{ kind: "property", property: "padding-top", scope: "" },
				] as const) {
					const value = await result(observed, `button >> nth=${index}`, operation);
					expect(value.kind, sample.name).toBe("refused");
					reads.push({ index, operation, value });
				}
			steps.push({ action, reads, display: await display(observed) });
		}
		outcomes.push({ name: sample.name, steps });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.refusedTransport = outcomes;
}, 30000);

it("resolves namespace and single export-star chains by binding and keeps ambiguous or indirect forms explicit", async () => {
	const cases = [
		{
			name: "namespace named member",
			barrel: `export {Button} from './leaf';`,
			importer: `import * as UI from 'shared/ui/barrel';`,
			call: `<UI.Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "namespace default member",
			barrel: `export {Button as default} from './leaf';`,
			importer: `import * as UI from 'shared/ui/barrel';`,
			call: `<UI.default label="Same"/>`,
			kind: "supported",
		},
		{
			name: "single star with renamed leaf",
			barrel: `export * from './renamed';`,
			importer: `import {Pick as Choice} from 'shared/ui/barrel';`,
			call: `<Choice label="Same"/>`,
			kind: "supported",
		},
		{
			name: "namespace through star",
			barrel: `export * from './leaf';`,
			importer: `import * as UI from 'shared/ui/barrel';`,
			call: `<UI.Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "explicit export wins over star",
			barrel: `export {Button} from './other';export * from './leaf';`,
			importer: `import {Button} from 'shared/ui/barrel';`,
			call: `<Button label="Same"/>`,
			kind: "supported",
			owner: "other.tsx",
		},
		{
			name: "multiple stars with same ultimate binding",
			barrel: `export * from './leaf';export * from './renamed';`,
			importer: `import {Button} from 'shared/ui/barrel';`,
			call: `<Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "nested namespace re-export",
			barrel: `export * as UI from './leaf';`,
			importer: `import {UI} from 'shared/ui/barrel';`,
			call: `<UI.Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "object member is not a namespace",
			barrel: `export {Button} from './leaf';`,
			importer: `import {Button} from 'shared/ui/barrel';const UI={Button};`,
			call: `<UI.Button label="Same"/>`,
			kind: "refused",
		},
		{
			name: "namespace shadowed by parameter",
			barrel: `export {Button} from './leaf';`,
			importer: `import * as UI from 'shared/ui/barrel';function Wrap({UI}){return <UI.Button label="Same"/>}`,
			call: `<Wrap UI={UI}/>`,
			kind: "refused",
		},
		{
			name: "lazy dynamic import",
			barrel: `export {Button as default} from './leaf';`,
			importer: `import {lazy,Suspense} from 'react';const Pick=lazy(()=>import('shared/ui/barrel'));`,
			call: `<Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense>`,
			kind: "supported",
		},
		{
			name: "lazy resolved namespace default",
			barrel: `export {Button as default} from './leaf';`,
			importer: `import {lazy,Suspense} from 'react';import * as UI from 'shared/ui/barrel';const Pick=lazy(()=>Promise.resolve(UI));`,
			call: `<Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense>`,
			kind: "supported",
		},
		{
			name: "lazy named projection",
			barrel: `export {Button} from './leaf';`,
			importer: `import {lazy,Suspense} from 'react';const Pick=lazy(()=>import('shared/ui/barrel').then(mod=>({default:mod.Button})));`,
			call: `<Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense>`,
			kind: "supported",
		},
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/leaf.tsx": `export const Button=({label})=><button className="p-4">{label}</button>;`,
			"shared/ui/other.tsx": `export const Button=({label})=><button className="p-4">{label}</button>;`,
			"shared/ui/renamed.ts": `export {Button as Pick,Button} from './leaf';`,
			"shared/ui/barrel.ts": sample.barrel,
			"frames/home/frame.tsx": `${sample.importer}export default function Frame(){return <main>${sample.call}${sample.call}</main>}`,
		});
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "observed");
		await normal.page.locator("button").first().waitFor();
		await observed.page.locator("button").first().waitFor();
		expect(await display(observed), sample.name).toEqual(await display(normal));
		const first = await result(observed, "button >> nth=0"),
			second = await result(observed, "button >> nth=1");
		expect(first.kind, sample.name).toBe(sample.kind);
		expect(second.kind, sample.name).toBe(sample.kind);
		let context: unknown = null;
		if (first.kind === "supported" && second.kind === "supported") {
			expect(first.target.address.start).not.toBe(second.target.address.start);
			const style = supported(
				await result(observed, "button >> nth=0", { kind: "property", property: "padding-top", scope: "" }),
			);
			expect(style.target.address.file).toContain("owner" in sample ? sample.owner : "leaf.tsx");
			context = reach(
				observed.sources,
				["frames/home/frame.tsx"],
				address(observed.sources.site(first.proof.selection.source)),
			);
			expect(context).toMatchObject({
				references: expect.arrayContaining([expect.objectContaining({ repeated: false })]),
				unknown: sample.name.startsWith("lazy") ? [expect.any(String), expect.any(String)] : [],
			});
			expect(first.proof.revisions.map((revision) => revision.path)).toContain("shared/ui/barrel.ts");
			writeDesignFile(root, "shared/ui/barrel.ts", `${sample.barrel}\n// changed binding route`);
			expect(await stillSelected(observed, first.proof.selection)).toBe(false);
		}
		outcomes.push({ name: sample.name, first, second, context });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.bindingInventory = outcomes;
}, 30000);

it("retires a changed authored call without resetting its host and excludes pending slot candidates", async () => {
	const root = project({
		"shared/ui/button.tsx": `export function Button({label}) {return <button className="p-4">{label}</button>}`,
		"shared/ui/pass.tsx": `export const Pass=({children})=>children;`,
		"frames/home/frame.tsx": `import {Suspense,startTransition,useState} from 'react';import {Button} from 'shared/ui/button';import {Pass} from 'shared/ui/pass';let ready=false,done;const gate=new Promise(resolve=>done=resolve);function Wait(){if(!ready)throw gate;return <i>Ready</i>}
export default function Frame(){const [flip,setFlip]=useState(false);const [next,setNext]=useState(false);globalThis.flip=()=>setFlip(!flip);globalThis.next=()=>startTransition(()=>setNext(true));globalThis.resolveGate=()=>{ready=true;done()};return <main>{flip?<Pass><Button label="Same"/></Pass>:<Pass><Button label="Same"/></Pass>}<Suspense fallback={<i>Waiting</i>}>{next?<section><Pass><Button label="Candidate"/></Pass><Wait/></section>:<Pass><Button label="Committed"/></Pass>}</Suspense><input id="input" defaultValue="Kept"/></main>}`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed");
	const before = supported(await result(observed, "button >> nth=0"));
	const old = supported(await result(observed, "button >> nth=1"));
	for (const mounted of [normal, observed]) {
		await mounted.page.locator("input").fill("Typed");
		await mounted.page.evaluate("flip()");
		await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	}
	const after = supported(await result(observed, "button >> nth=0"));
	expect(after.target.address).not.toEqual(before.target.address);
	expect(after.proof.selection.occurrence).toBe(before.proof.selection.occurrence);
	expect(await stillSelected(observed, before.proof.selection)).toBe(false);
	expect(await display(observed)).toEqual(await display(normal));
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("next()");
		await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	}
	expect(await observed.page.locator('button:text-is("Candidate")').count()).toBe(0);
	expect(await stillSelected(observed, old.proof.selection)).toBe(true);
	expect((await read(observed, old.proof.selection, { kind: "text" })).kind).toBe("supported");
	expect(await display(observed)).toEqual(await display(normal));
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("resolveGate()");
		await mounted.page.locator('i:text-is("Ready")').waitFor();
	}
	expect(await stillSelected(observed, old.proof.selection)).toBe(false);
	const candidate = supported(await result(observed, 'button:text-is("Candidate")'));
	expect(await display(observed)).toEqual(await display(normal));
	evidence.committedTransport = {
		before,
		after,
		old,
		candidate,
		sameHostAcrossCallSwitch: true,
		pendingCandidateUnselectable: true,
	};
	await normal.page.close();
	await observed.page.close();
});

it("keeps invalid module graphs outside mounted selection in both runtimes", async () => {
	const cases = [
		{
			name: "star excludes default",
			files: { "shared/ui/barrel.ts": `export * from './leaf';` },
			importer: `import Button from 'shared/ui/barrel'`,
		},
		{
			name: "ambiguous star exports",
			files: { "shared/ui/barrel.ts": `export * from './leaf';export * from './other';` },
			importer: `import {Button} from 'shared/ui/barrel'`,
		},
		{
			name: "cycle without a definition",
			files: {
				"shared/ui/barrel.ts": `export * from './cycle';`,
				"shared/ui/cycle.ts": `export * from './barrel';`,
			},
			importer: `import {Button} from 'shared/ui/barrel'`,
		},
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/leaf.tsx": `export default function Button(){return <button>Same</button>} export {Button};`,
			"shared/ui/other.tsx": `export function Button(){return <button>Same</button>}`,
			...sample.files,
			"frames/home/frame.tsx": `${sample.importer};export default ()=> <main><Button/></main>`,
		});
		const errors = [];
		for (const mode of [false, "observed"] as const) {
			let message = "";
			try {
				const mounted = await mount(browser, root, "home", mode);
				await mounted.page.close();
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message, sample.name).toMatch(/No matching export|Ambiguous import/);
			errors.push(message);
		}
		expect(errors[0]).toBe(errors[1]);
		outcomes.push({ name: sample.name, errors, selectedOccurrence: null });
	}
	evidence.invalidModules = outcomes;
});

it("disables attribution for an unpinned renderer without replacing an existing hook", async () => {
	const cases = [
		{ version: "19.2.6", reconcilerVersion: "19.2.6", rendererPackageName: "react-dom", bundleType: 0 },
		{ version: "19.2.7", reconcilerVersion: "19.2.7", rendererPackageName: "react-dom", bundleType: 1 },
		{ version: "19.2.7", reconcilerVersion: "19.2.7", rendererPackageName: "another-renderer", bundleType: 0 },
	];
	const outcomes = [];
	for (const renderer of cases) {
		const page = await browser.newPage();
		await page.evaluate(installObserver, false);
		const failure = await page.evaluate((value) => {
			const hook = Reflect.get(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__") as {
				inject(renderer: unknown): number;
			};
			hook.inject(value);
			return globalThis.__handObserver.failure;
		}, renderer);
		expect(failure).toContain("only React DOM 19.2.7 production");
		outcomes.push({ renderer, failure });
		await page.close();
	}
	evidence.rendererGate = {
		outcomes,
		limit: "synthetic rejection checks only; no compatibility claim for these renderers",
	};
});

it("compares host element contracts against ordinary JSX with no baseline source stamping", async () => {
	const root = project({
		"frames/home/frame.tsx": `function Pass({children}){globalThis.contract={type:children.type,keys:Object.keys(children.props).sort(),label:children.props.children};return children}export default ()=> <main><Pass><button title="Example">Same</button></Pass></main>`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed");
	const ordinary = await display(normal);
	expect(await display(observed)).toEqual(ordinary);
	expect(ordinary.contract).toEqual({ type: "button", keys: ["children", "title"], label: "Same" });
	expect(await observed.page.locator("#root").innerHTML()).toBe(await normal.page.locator("#root").innerHTML());
	evidence.baseline = { ordinary, html: await normal.page.locator("#root").innerHTML(), sourceStamping: false };
	await normal.page.close();
	await observed.page.close();
});
