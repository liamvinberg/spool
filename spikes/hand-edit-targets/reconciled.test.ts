import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { type Mounted, mount, read, select, stillSelected } from "./automatic-browser";
import type { Operation } from "./automatic-source";
import { installObserver } from "./observer";
import { RENDERER_SHA256, reconciledRenderer } from "./reconciled-renderer";

const evidence: Record<string, unknown> = {};
const roots: string[] = [];
let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	evidence.environment = {
		react: JSON.parse(readFileSync("node_modules/react/package.json", "utf8")).version as unknown,
		renderer: "react-dom/client production, disposable build-time reconciliation taps",
		rendererSha256: RENDERER_SHA256,
		browser: browser.version(),
	};
});
afterAll(async () => {
	await browser?.close();
	if (process.env.RECONCILED_EVIDENCE)
		writeFileSync(
			process.env.RECONCILED_EVIDENCE,
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
		html: document.querySelector("#root")?.innerHTML,
		portal: document.querySelector("#portal")?.innerHTML,
		input: (document.querySelector("input") as HTMLInputElement | null)?.value,
		focus: document.activeElement?.id,
		refs: Reflect.get(globalThis, "refs") as unknown,
		contract: Reflect.get(globalThis, "contract") as unknown,
	}));
}
async function act(mounted: Mounted, action: string) {
	await mounted.page.evaluate(action);
	await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

it("witnesses the committed memo call while keeping retained value origins separate", async () => {
	const outcomes = [];
	for (const comparator of ["", ", () => true"]) {
		const source = `import {memo,useState} from 'react';
const Button=({label})=><button className="p-4">{label}</button>;
const Memo=memo(Button${comparator});
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(!flip);
const call=flip ? <Memo label="Same" /> : <Memo label="Same"/>;
globalThis.firstCall??=call;globalThis.latestCall=call;
const decoy=<Memo label="Never mounted"/>;
globalThis.contract={type:call.type===Memo,keys:Object.keys(call.props),label:call.props.label,key:call.key};
return <main>{call}<input id="input" defaultValue="Kept"/></main>}`;
		const root = project({ "frames/home/frame.tsx": source });
		const normal = await mount(browser, root, "home", false);
		const observed = await mount(browser, root, "home", "reconciled");
		const initial = supported(await result(observed, "button"));
		expect(initial.target.address.start).toBe(source.indexOf('<Memo label="Same"/>'));
		const steps = [];
		for (const action of ["flip()", "rerender()", "flip()", "flip()"]) {
			for (const mounted of [normal, observed]) {
				await mounted.page.locator("input").fill("Typed");
				await act(mounted, action);
			}
			expect(await display(observed)).toEqual(await display(normal));
			const pick = await select(observed, "button");
			expect(pick.occurrence).toBe(initial.proof.selection.occurrence);
			expect(pick.refusal).toBeUndefined();
			const call = pick.chain.at(-1)!;
			const active = observed.sources.site(call.source);
			const latestIsFirstBranch = steps.length !== 2;
			expect(active.node.start).toBe(
				source.indexOf(latestIsFirstBranch ? '<Memo label="Same" />' : '<Memo label="Same"/>'),
			);
			expect(call.retainedProps).toBe(true);
			const text = await read(observed, pick, { kind: "text" });
			expect(text).toMatchObject({ kind: "refused", reason: expect.stringContaining("per-value origin") });
			const style = supported(
				await result(observed, "button", { kind: "property", property: "padding-top", scope: "" }),
			);
			expect(style.target.role).toBe("definition");
			expect(style.property?.owner?.token).toBe("p-4");
			expect(await stillSelected(observed, initial.proof.selection)).toBe(false);
			steps.push({ action, pick, text, style });
		}
		outcomes.push({ comparator: comparator || "default", initial, steps });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.memo = outcomes;
}, 30000);

it("keeps custom retained values distinct from changed default-memo calls and local state", async () => {
	const outcomes = [];
	for (const comparator of ["", ",()=>true"]) {
		const source = `import {memo,useState} from 'react';
function Button({label}){const [n,setN]=useState(0);globalThis.increment=()=>setN(x=>x+1);return <button className="p-4"><span>{label}</span><b>{n}</b></button>}
const Memo=memo(Button${comparator});
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(x=>!x);return <main>{flip ? <Memo label="New"/> : <Memo label="Old"/>}<input id="input" defaultValue="Kept"/></main>}`;
		const root = project({ "frames/home/frame.tsx": source });
		const normal = await mount(browser, root, "home", false);
		const observed = await mount(browser, root, "home", "reconciled");
		const initial = await select(observed, "button");
		const steps = [];
		for (const action of ["flip()", "increment()", "increment()", "rerender()"]) {
			for (const mounted of [normal, observed]) {
				await mounted.page.locator("input").fill("Typed");
				await act(mounted, action);
			}
			expect(await display(observed)).toEqual(await display(normal));
			expect(await observed.page.locator("span").textContent()).toBe(comparator ? "Old" : "New");
			const pick = await select(observed, "button");
			expect(pick.refusal).toBeUndefined();
			expect(pick.occurrence).toBe(initial.occurrence);
			expect(observed.sources.site(pick.chain.at(-1)!.source).node.start).toBe(
				source.indexOf('<Memo label="New"/>'),
			);
			const style = supported(await read(observed, pick, { kind: "property", property: "padding-top", scope: "" }));
			const text = await result(observed, "span");
			expect(text.kind).toBe("refused"); // Stateful value flow is not the immutable source subset.
			steps.push({ action, pick, style, text, display: await display(observed) });
		}
		outcomes.push({ comparator: comparator || "default", steps });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.localState = outcomes;
});

it("resolves changed default-memo text and authored structure without borrowing a previous call", async () => {
	const source = `import {memo,useState} from 'react';
const Button=({label})=><button className="p-4">{label}</button>;const Memo=memo(Button);
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(x=>!x);return <main>{flip ? <><Memo label="New"/><i>After</i></> : <><Memo label="Old"/><i>Before</i></>}<input id="input"/></main>}`;
	const root = project({ "frames/home/frame.tsx": source });
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "reconciled");
	const old = supported(await result(observed, "button"));
	for (const mounted of [normal, observed]) await act(mounted, "flip()");
	expect(await display(observed)).toEqual(await display(normal));
	const fresh = supported(await result(observed, "button"));
	expect(fresh.target.expected).toBe("New");
	expect(fresh.target.role).toBe("call-site");
	expect(fresh.target.address.start).toBe(source.indexOf('<Memo label="New"/>'));
	const deletion = supported(await result(observed, "button", { kind: "delete" }));
	const reorder = supported(await result(observed, "button", { kind: "reorder" }));
	expect(deletion.target.address).toEqual(fresh.target.address);
	expect(reorder.target.address).toEqual(fresh.target.address);
	expect(await stillSelected(observed, old.proof.selection)).toBe(false);
	evidence.changedValues = { old, fresh, deletion, reorder };
	await normal.page.close();
	await observed.page.close();
});

it("rejects suspended and abandoned candidates even when an alternate Fiber is reused", async () => {
	const source = `import {memo,Suspense,startTransition,useState} from 'react';
let ready=false;let resolve;const pending=new Promise(r=>resolve=r);globalThis.release=()=>{ready=true;resolve()};
const Button=({label})=><button className="p-4">{label}</button>;const Memo=memo(Button);
function Gate({mode}){if(mode===1&&!ready)throw pending;return <i>Ready</i>}
function Content({mode}){globalThis.attempts??=[];globalThis.attempts.push(mode);return <>{mode===0 ? <Memo label="Old"/> : mode===1 ? <Memo label="Pending"/> : <Memo label="Urgent"/>}<Gate mode={mode}/></>}
export default function Frame(){const [mode,setMode]=useState(0);globalThis.pending=()=>startTransition(()=>setMode(1));globalThis.urgent=()=>setMode(2);return <main><Suspense fallback={<b>Loading</b>}><Content mode={mode}/></Suspense><input id="input" defaultValue="Kept"/></main>}`;
	const outcomes = [];
	for (const abandon of [false, true]) {
		const root = project({ "frames/home/frame.tsx": source });
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "reconciled");
		const initial = supported(await result(observed, "button"));
		const commits = await observed.page.evaluate(() => globalThis.__handObserver.commits);
		for (const mounted of [normal, observed]) {
			await act(mounted, "pending()");
			await mounted.page.waitForFunction(() => (Reflect.get(globalThis, "attempts") as number[]).includes(1));
		}
		expect(await display(observed)).toEqual(await display(normal));
		expect(await stillSelected(observed, initial.proof.selection)).toBe(true);
		expect(await observed.page.evaluate(() => globalThis.__handObserver.commits)).toBe(commits);
		const during = await select(observed, "button");
		expect(during).toEqual(initial.proof.selection);
		for (const mounted of [normal, observed]) {
			if (abandon) await act(mounted, "urgent()");
			await act(mounted, "release()");
			await mounted.page.locator(`button:text-is("${abandon ? "Urgent" : "Pending"}")`).waitFor();
			await act(mounted, "rerender()");
		}
		expect(await display(observed)).toEqual(await display(normal));
		const pick = await select(observed, "button");
		expect(pick.refusal).toBeUndefined();
		expect(observed.sources.site(pick.chain.at(-1)!.source).node.start).toBe(
			source.indexOf(abandon ? '<Memo label="Urgent"/>' : '<Memo label="Pending"/>'),
		);
		expect(await stillSelected(observed, initial.proof.selection)).toBe(false);
		const text = await read(observed, pick, { kind: "text" });
		const style = supported(await read(observed, pick, { kind: "property", property: "padding-top", scope: "" }));
		outcomes.push({ abandon, initial, during, pick, text, style });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.transitions = outcomes;
}, 30000);

it("keeps equal-label keyed occurrences attached to their actual reconciled calls after reorder", async () => {
	const source = `import {memo,useState} from 'react';const Button=({label})=><button className="p-4">{label}</button>;const Memo=memo(Button);
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(x=>!x);return <main>{flip ? <><Memo key="b" label="Same"/><Memo key="a" label="Same"/></> : <><Memo key="a" label="Same" /><Memo key="b" label="Same" /></>}<input id="input"/></main>}`;
	const root = project({ "frames/home/frame.tsx": source });
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "reconciled");
	const first = await select(observed, "button >> nth=0"),
		second = await select(observed, "button >> nth=1");
	for (const mounted of [normal, observed]) await act(mounted, "flip()");
	expect(await display(observed)).toEqual(await display(normal));
	const after = [await select(observed, "button >> nth=0"), await select(observed, "button >> nth=1")];
	expect(after.map((p) => p.occurrence)).toEqual([second.occurrence, first.occurrence]);
	const targets = [];
	for (let index = 0; index < after.length; index++) {
		const pick = after[index]!;
		const deletion = supported(await read(observed, pick, { kind: "delete" }));
		expect(deletion.target.address.start).toBe(
			source.indexOf(index === 0 ? '<Memo key="b" label="Same"/>' : '<Memo key="a" label="Same"/>'),
		);
		const text = await read(observed, pick, { kind: "text" });
		expect(text.kind).toBe("refused");
		targets.push({ pick, deletion, text });
	}
	evidence.keyed = { first, second, targets };
	await normal.page.close();
	await observed.page.close();
});

it("records exact remaining clone, cached and slot refusals for each operation with rendering parity", async () => {
	const cases = [
		{
			name: "clone preserves every prop",
			body: `return cloneElement(children)`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{
			name: "clone replaces equal label",
			body: `return cloneElement(children,{label:'Same'})`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{
			name: "clone replaces label",
			body: `return cloneElement(children,{label:'Changed'})`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{
			name: "clone preserves children and class",
			body: `return cloneElement(children,{title:'New'})`,
			call: `<Pass><strong className="p-4">Same</strong></Pass>`,
		},
		{
			name: "clone replaces class and preserves children",
			body: `return cloneElement(children,{className:'p-8'})`,
			call: `<Pass><strong className="p-4">Same</strong></Pass>`,
		},
		{
			name: "clone replaces inline style and preserves children",
			body: `return cloneElement(children,{style:{padding:32}})`,
			call: `<Pass><strong style={{padding:16}}>Same</strong></Pass>`,
		},
		{
			name: "clone replaces children and preserves style",
			body: `return cloneElement(children,{},'Changed')`,
			call: `<Pass><strong className="p-4">Same</strong></Pass>`,
		},
		{
			name: "clone replaces named slot",
			body: `return cloneElement(children,{header:<Button label="Replacement"/>})`,
			call: `<Pass><Header header={<Button label="Same"/>}/></Pass>`,
		},
		{
			name: "recreated component has no observed creation",
			body: `return createElement(children.type,{label:'Same'})`,
			call: `<Pass><Button label="Same"/></Pass>`,
		},
		{
			name: "Children.toArray creates keyed elements",
			body: `return Children.toArray(children)`,
			call: `<Pass><Button label="Same"/><Button label="Same"/></Pass>`,
		},
		{
			name: "cached first child between different callers",
			body: `globalThis.saved??=children;return globalThis.saved`,
			call: `<><Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass></>`,
		},
		{ name: "named header slot", body: `return header`, call: `<Pass header={<Button label="Same"/>}/>` },
		{
			name: "changed conditional child relationship",
			body: `return children`,
			call: `<Pass>{flip ? <Button label="Same"/> : <Button label="Same" />}</Pass>`,
		},
		{
			name: "changed named slot relationship",
			body: `return flip ? footer : header`,
			call: `<Pass flip={flip} header={<Button label="Same"/>} footer={<Button label="Same"/>}/>`,
		},
		{
			name: "ordinary unobserved component createElement",
			body: `return children`,
			call: `{createElement(Button,{label:'Same'})}`,
		},
		{
			name: "ordinary unobserved host createElement",
			body: `return children`,
			call: `{createElement('strong',{className:'p-4'},'Same')}`,
		},
	];
	const outcomes = [];
	for (const sample of cases) {
		const source = `import {Children,cloneElement,createElement,useState} from 'react';
const Button=({label})=><button className="p-4">{label}</button>;const Header=({header})=>header;
function Pass({children,header,footer,flip}){${sample.body}}
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(x=>!x);return <main>${sample.call}<input id="input" defaultValue="Kept"/></main>}`;
		const root = project({ "frames/home/frame.tsx": source });
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "reconciled");
		const steps = [];
		for (const action of [null, "flip()", "rerender()"]) {
			if (action)
				for (const mounted of [normal, observed]) {
					await mounted.page.locator("input").fill("Typed");
					await act(mounted, action);
				}
			expect(await display(observed), sample.name).toEqual(await display(normal));
			const reads = [];
			for (let index = 0; index < (await observed.page.locator("button,strong").count()); index++) {
				const pick = await select(observed, `button,strong >> nth=${index}`);
				for (const operation of [
					{ kind: "text" },
					{ kind: "delete" },
					{ kind: "property", property: "padding-top", scope: "" },
				] as const) {
					const value = await read(observed, pick, operation);
					expect(value.kind, sample.name).toBe("refused");
					reads.push({ index, pick, operation, value });
				}
			}
			steps.push({ action, reads, display: await display(observed) });
		}
		outcomes.push({ name: sample.name, steps });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.valueOrigins = outcomes;
}, 60000);

it("preserves refs, types, props, keys, state, focus and compound React rendering against ordinary JSX", async () => {
	const source = `import {Component,Suspense,cloneElement,createContext,forwardRef,lazy,memo,startTransition,useContext,useEffect,useRef,useState} from 'react';import {createPortal} from 'react-dom';
const Context=createContext('default');function Plain({label,ref}){return <button ref={ref}>{label}</button>}
const Memo=memo(Plain);const Forward=forwardRef(({label},ref)=><button ref={ref}>{label}</button>);
class ClassButton extends Component{render(){return <button>Class</button>}}function ContextButton(){const label=useContext(Context);return <button>{label}</button>}
function Pair(){return <><b>One</b><b>Two</b></>}function Nothing(){return null}
function Slot({children}){const copy=cloneElement(children,{label:'Cloned'});globalThis.contract={type:children.type===Plain,copyType:copy.type===Plain,props:Object.keys(children.props).sort(),copyProps:Object.keys(copy.props).sort(),key:children.key,copyKey:copy.key,ref:copy.props.ref===children.props.ref,children:copy.props.children===children.props.children};return copy}
const Lazy=lazy(()=>new Promise(resolve=>{globalThis.resolveLazy=()=>resolve({default:Plain})}));
function Stateful(){const [n,setN]=useState(0);return <button id="state" onClick={()=>startTransition(()=>setN(n+1))}>{n}</button>}
export default function Frame(){const ref=useRef(null),forward=useRef(null),instance=useRef(null),cloned=useRef(null);useEffect(()=>{globalThis.refs=[ref.current?.tagName,forward.current?.tagName,instance.current instanceof ClassButton,cloned.current?.tagName]},[]);return <main><Plain ref={ref} label="Plain"/><Memo label="Memo"/><Forward ref={forward} label="Forward"/><ClassButton ref={instance}/><Context value="Context"><ContextButton/></Context><Slot><Plain key="stable" ref={cloned} label="Original">Child</Plain></Slot><Pair/><Nothing/>{createPortal(<Plain label="Portal"/>,document.getElementById('portal'))}<Suspense fallback={<i>Loading</i>}><Lazy label="Lazy"/></Suspense><Stateful/><input id="input" defaultValue="Kept"/></main>}`;
	const root = project({ "frames/home/frame.tsx": source });
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "reconciled");
	expect(await display(observed)).toEqual(await display(normal));
	const initial = await display(observed);
	for (const mounted of [normal, observed]) {
		await mounted.page.locator("#state").click();
		await mounted.page.locator("#state:text-is('1')").waitFor();
		await mounted.page.locator("input").fill("Typed");
		await act(mounted, "resolveLazy()");
		await mounted.page.locator('button:text-is("Lazy")').waitFor();
		await act(mounted, "rerender()");
	}
	expect(await display(observed)).toEqual(await display(normal));
	const reads = [];
	for (const label of ["Plain", "Memo", "Forward", "Class", "Context", "Cloned", "Lazy", "Portal"]) {
		const value = await result(observed, `button:text-is("${label}")`);
		reads.push({ label, value });
	}
	const picked = await select(observed, "#state");
	expect(await observed.page.locator("[data-spool-source],[data-probe-occurrence],[data-probe-chain]").count()).toBe(
		0,
	);
	const final = await display(observed);
	await act(observed, "unmount()");
	expect(await stillSelected(observed, picked)).toBe(false);
	evidence.reactParity = { initial, final, reads, unmountRetires: true };
	await normal.page.close();
	await observed.page.close();
});

it("retains caller, definition and carrier revisions plus the existing owner admission seam", async () => {
	const files = {
		"shared/ui/leaf.tsx": `import {memo} from 'react';const Button=({label})=><button className="p-4">{label}</button>;export const Memo=memo(Button);`,
		"shared/ui/exports.ts": `export {Memo} from './leaf';`,
		"shared/ui/pass.tsx": `export const Pass=({children})=>children;`,
		"shared/ui/group.tsx": `import {Memo} from './exports';import {Pass} from './pass';export const Group=({label})=><Pass><Memo label={label}/></Pass>;`,
		"frames/home/frame.tsx": `import {Group} from 'shared/ui/group';export default function Frame(){return <main><Group label="Same"/><Group label="Same"/></main>}`,
	};
	const root = project(files);
	let admitted = true;
	const observed = await mount(browser, root, "home", "reconciled", {
		capture: async (revisions) => ({
			epoch: "synthetic-owner",
			handles: revisions.map(({ path }, i) => ({ path, handle: `source-${i}`, revision: 1 })),
		}),
		valid: async (lease, revisions) =>
			admitted &&
			lease.epoch === "synthetic-owner" &&
			revisions.every(({ path }) => lease.handles.some((handle) => handle.path === path)),
	});
	const value = supported(await result(observed, "button >> nth=0"));
	const other = supported(await result(observed, "button >> nth=1"));
	expect(value.target.role).toBe("call-site");
	expect(value.target.address).not.toEqual(other.target.address);
	expect(value.proof.revisions.map((r) => r.path).sort()).toEqual([...Object.keys(files), "shared/tokens.css"].sort());
	expect(value.proof.owner?.handles).toHaveLength(6);
	expect(value.proof.committedRender).toBeGreaterThan(0);
	expect(value.proof.selection.generation).toBe(observed.generation);
	admitted = false;
	expect(await stillSelected(observed, value.proof.selection)).toBe(false);
	admitted = true;
	expect(await stillSelected(observed, value.proof.selection)).toBe(true);
	const retirements = [];
	for (const [path, source] of Object.entries({ ...files, "shared/tokens.css": "" })) {
		writeDesignFile(root, path, `${source}\n/* new revision */`);
		expect(await stillSelected(observed, value.proof.selection)).toBe(false);
		retirements.push(path);
		writeDesignFile(root, path, source);
	}
	evidence.authority = {
		value,
		other,
		retirements,
		ownerRetires: true,
		boundary: "synthetic seam only; actual process admission remains with existing tasks",
	};
	await observed.page.close();
});

it("rejects different renderer bytes and leaves an existing DevTools hook in control with attribution disabled", async () => {
	const root = makeTempDir();
	writeFileSync(`${root}/react-dom-client.production.js`, "export const changed = true;");
	await expect(
		build({
			entryPoints: [`${root}/react-dom-client.production.js`],
			write: false,
			bundle: true,
			plugins: [reconciledRenderer()],
			logLevel: "silent",
		}),
	).rejects.toThrow("exact pinned renderer bytes");
	const page = await browser.newPage();
	await page.evaluate(() => {
		const hook = {
			supportsFiber: true,
			inject() {
				return 47;
			},
			onCommitFiberRoot() {},
		};
		Reflect.set(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", hook);
		Reflect.set(globalThis, "existingHook", hook);
	});
	await page.evaluate(installObserver, true);
	const status = await page.evaluate(() => ({
		preserved: Reflect.get(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__") === Reflect.get(globalThis, "existingHook"),
		failure: globalThis.__handObserver.failure,
	}));
	expect(status).toEqual({ preserved: true, failure: "existing DevTools hook integration is unproven" });
	evidence.gates = {
		changedRendererRefused: true,
		...status,
		coexistence: "attribution disabled, not a coexistence proof",
	};
	await page.close();
});
