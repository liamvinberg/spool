import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { assetSite } from "../../src/daemon/hand-lane";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { mount, read, select, stillSelected } from "./automatic-browser";
import { address, reach } from "./automatic-source";
import { installObserver } from "./observer";

const evidence: Record<string, unknown> = {};
const roots: string[] = [];
let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(async () => {
	await browser?.close();
	if (process.env.OBSERVED_EVIDENCE)
		writeFileSync(
			process.env.OBSERVED_EVIDENCE,
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
	for (const [path, text] of Object.entries(files)) writeDesignFile(root, path, text);
	return root;
}
const supported = (result: Awaited<ReturnType<typeof read>>) => {
	if (result.kind !== "supported") throw new Error(result.reason);
	return result;
};

async function stableText(mounted: Awaited<ReturnType<typeof mount>>, selector: string) {
	for (let attempt = 0; attempt < 5; attempt++) {
		const result = await read(mounted, await select(mounted, selector), { kind: "text" });
		if (result.kind !== "refused" || result.reason !== "React committed another render during the read")
			return result;
		// This test requests a fresh selection after a correctly refused moving
		// read. The reader itself neither retries a mutation nor hides that refusal.
		await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	}
	throw new Error("composition did not settle for a source read");
}

it("observes ordinary composition without changing props, types, refs, children or committed behavior", async () => {
	const source = `import {Component, Suspense, cloneElement, createContext, forwardRef, lazy, memo, startTransition, useContext, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
const Context = createContext('default');
function Plain({label, ref}) {return <button ref={ref}>{label}</button>}
const Arrow = ({label: text}) => <button>{text}</button>;
const Memo = memo(Plain);
const Forward = forwardRef(({label}, ref) => <button ref={ref}>{label}</button>);
class ClassButton extends Component {render(){return <button>Class literal</button>}}
function ContextButton(){const label=useContext(Context); return <button>{label}</button>}
function Pair(){return <><b>One</b><b>Two</b></>}
function Nothing(){return null}
function Slot({children}){globalThis.contract = {type: children.type === Plain, props: Object.keys(children.props).sort(), label: children.props.label, children: children.props.children}; return cloneElement(children, {label:'Cloned'})}
function Pass({children}){return children}
const Lazy = lazy(() => new Promise(resolve => {globalThis.resolveLazy = () => resolve({default: Plain})}));
function Stateful(){const [n, setN] = useState(0); return <button id="state" onClick={()=>startTransition(()=>setN(n+1))}>{n}</button>}
export default function Frame(){const ref=useRef(null); const forward=useRef(null); const instance=useRef(null); useEffect(()=>{globalThis.refs = [ref.current?.tagName,forward.current?.tagName,instance.current instanceof ClassButton]},[]); return <main>
<Plain ref={ref} label="Plain"/><Arrow label="Arrow"/><Memo label="Memo"/><Forward ref={forward} label="Forward"/><ClassButton ref={instance}/><Context value="Context"><ContextButton/></Context><Slot><Plain label="Original">Child</Plain></Slot><Pass><Plain label="Passed"/></Pass><Pair/><Nothing/>{createPortal(<Plain label="Portal"/>, document.getElementById('portal'))}<Suspense fallback={<span id="fallback">Loading</span>}><Lazy label="Lazy"/></Suspense><Stateful/><input id="input" defaultValue="Kept"/></main>}`;
	const root = project({ "frames/home/frame.tsx": source });
	const normal = await mount(browser, root, "home", false);
	const observed = await mount(browser, root, "home", "observed");
	const sample = async (mounted: typeof normal) =>
		mounted.page.evaluate(() => ({
			labels: [...document.querySelectorAll("button,b,#fallback")].map((n) => n.textContent),
			contract: Reflect.get(globalThis, "contract") as unknown,
			refs: Reflect.get(globalThis, "refs") as unknown,
			input: (document.querySelector("#input") as HTMLInputElement).value,
			focus: document.activeElement?.id,
		}));
	const initial = await sample(normal);
	expect(await sample(observed)).toEqual(initial);
	const results: unknown[] = [];
	for (const label of [
		"Plain",
		"Arrow",
		"Memo",
		"Forward",
		"Class literal",
		"Context",
		"Cloned",
		"Passed",
		"Portal",
	]) {
		const result = await stableText(observed, `button:text-is("${label}")`);
		if (["Memo", "Context", "Cloned"].includes(label)) expect(result.kind).toBe("refused");
		else supported(result);
		results.push({ label, result });
	}
	const before = await select(observed, "#state");
	for (const mounted of [normal, observed]) {
		await mounted.page.locator("#state").click();
		await mounted.page.locator("#state").filter({ hasText: "1" }).waitFor();
		await mounted.page.locator("#input").fill("Typed");
		await mounted.page.evaluate("resolveLazy()");
		await mounted.page.locator('button:text-is("Lazy")').waitFor();
		await mounted.page.evaluate("rerender()");
	}
	expect(await sample(observed)).toEqual(await sample(normal));
	expect(await stillSelected(observed, before)).toBe(true);
	const lazy = await read(observed, await select(observed, 'button:text-is("Lazy")'), { kind: "text" });
	expect(lazy.kind).toBe("refused");
	const stampCount = await observed.page
		.locator("[data-spool-source],[data-probe-occurrence],[data-probe-chain]")
		.count();
	expect(stampCount).toBe(0);
	await observed.page.evaluate("unmount()");
	expect(await stillSelected(observed, before)).toBe(false);
	evidence.composition = {
		react: "19.2.7 production",
		browser: browser.version(),
		initial,
		results,
		lazy,
		ordinaryUpdates: "same labels, refs, focus and input after transition, lazy resolution and rerender",
		sourceAttributesAdded: stampCount,
		unmountInvalidates: true,
	};
	await normal.page.close();
	await observed.page.close();
});

it("joins default, arrow, function expression and explicit re-export bindings and retains every hop", async () => {
	const root = project({
		"shared/ui/leaf.tsx": `export const Arrow = ({label: text}) => <button>{text}</button>; const Local = function({children}){return <strong>{children}</strong>}; export {Local as Renamed}; export default ({label}) => <i>{label}</i>;`,
		"shared/ui/exports.ts": `export {Arrow as Choice, Renamed, default as DefaultLabel} from './leaf';`,
		"frames/home/frame.tsx": `import {Choice as Pick, Renamed, DefaultLabel} from 'shared/ui/exports'; const Frame = () => <main><Pick label="Same"/><Pick label="Same"/><Renamed>Child</Renamed><DefaultLabel label="Default"/></main>; export default Frame;`,
	});
	const mounted = await mount(browser, root, "home", "observed");
	const results = [];
	for (const selector of ["button:first-child", "button:nth-child(2)", "strong", "i"])
		results.push(supported(await read(mounted, await select(mounted, selector), { kind: "text" })));
	expect(results[0]?.target.address).not.toEqual(results[1]?.target.address);
	const context = reach(
		mounted.sources,
		["frames/home/frame.tsx"],
		address(mounted.sources.site(results[0]!.proof.selection.source)),
	);
	expect(context.potential).toHaveLength(1);
	expect(context.references).toHaveLength(2);
	expect(context.unknown).toHaveLength(0);
	expect(results[0]?.proof.revisions.map((r) => r.path)).toEqual(
		expect.arrayContaining(["shared/ui/leaf.tsx", "shared/ui/exports.ts", "frames/home/frame.tsx"]),
	);
	writeDesignFile(
		root,
		"shared/ui/exports.ts",
		`export {Renamed as Choice, Renamed, default as DefaultLabel} from './leaf';`,
	);
	expect(await stillSelected(mounted, results[0]!.proof.selection)).toBe(false);
	evidence.bindings = { results, context };
	await mounted.page.close();
});

it("does not promote memo bailouts, clones or unobserved createElement calls to successful local targets", async () => {
	const root = project({
		"frames/home/frame.tsx": `import {memo, cloneElement, createElement, useState} from 'react'; function Button({label}){return <button>{label}</button>} const Memo=memo(Button); export default function Frame(){const [flip,setFlip]=useState(false); return <main>{flip ? <Memo label="Same"/> : <Memo label="Same"/>}{cloneElement(<Button label="Same"/>,{label:'Same'})}{createElement(Button,{label:'Same'})}<a id="flip" onClick={()=>setFlip(!flip)}>Flip</a></main>}`,
	});
	const mounted = await mount(browser, root, "home", "observed");
	const selection = await select(mounted, "button:first-child");
	expect((await read(mounted, selection, { kind: "text" })).kind).toBe("refused");
	await mounted.page.locator("#flip").click();
	// Equal-prop memo bailouts can retain old props even after the call site
	// changes. This source form refuses from the first read, not only afterwards.
	expect(selection.refusal).toContain("memo source continuity");
	const results = [];
	for (const selector of ["button:first-child", "button:nth-child(2)", "button:nth-child(3)"]) {
		const result = await read(mounted, await select(mounted, selector), { kind: "text" });
		expect(result.kind).toBe("refused");
		results.push(result);
	}
	evidence.unobserved = results;
	await mounted.page.close();
});

it("resolves a selected imported image and invalidates the read when the asset changes", async () => {
	const root = project({
		"frames/home/frame.tsx": `import image from './image.png'; export default function Frame(){return <img src={image}/>} `,
	});
	writeFileSync(
		join(root, "design/frames/home/image.png"),
		Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
			"base64",
		),
	);
	const mounted = await mount(browser, root, "home", "observed");
	const selection = await select(mounted, "img");
	const result = supported(await read(mounted, selection, { kind: "asset" }));
	expect(result.target.asset?.identifier).toBe("image");
	expect(result.proof.assets).toHaveLength(1);
	const replacement = await assetSite(
		root,
		"home",
		result.target.source,
		{ kind: "new", name: "replacement.png", bytes: readFileSync(join(root, "design/frames/home/image.png")) },
		{ framesUsing: async () => ["home"] },
		result.proof.revisions.find((revision) => revision.file === result.target.address.file)?.revision,
	);
	expect(replacement.kind).toBe("ok");
	if (replacement.kind !== "ok") throw new Error("selected asset did not enter the existing image planner");
	expect(replacement.text).toContain("replacement.png");
	// The read/planning probe has not performed the image or source mutation.
	expect(readFileSync(result.target.address.file, "utf8")).toContain("./image.png");
	const file = join(root, "design/frames/home/image.png");
	writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("changed")]));
	expect(await stillSelected(mounted, selection)).toBe(false);
	evidence.image = {
		result,
		existingAssetRoute: { kind: replacement.kind, path: replacement.path, proposedSource: replacement.text },
	};
	await mounted.page.close();
});

it("records the remaining syntax inventory without accepting coincidentally equal text", async () => {
	const cases = [
		{
			name: "map callback shadows same-valued prop",
			definition: `export function Button({label}){return <button>{['Same'].map(label=><span key={label}>{label}</span>)}</button>}`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			selector: "span",
			kind: "refused",
		},
		{
			name: "called code can mutate props",
			definition: `function mutate(props){props.label='Same'} export function Button(props){return <button>{mutate(props)}<span>{props.label}</span></button>}`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			selector: "span",
			kind: "refused",
		},
		{
			name: "anonymous default function",
			definition: `export default function({label}) {return <button>{label}</button>}`,
			importer: `import Button from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "immutable local alias",
			definition: `const Original = ({label}) => <button>{label}</button>; const Button=Original; export {Button};`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "direct props member",
			definition: `export const Button = props => <button>{props.label}</button>`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "namespace member",
			definition: `export const Button = ({label}) => <button>{label}</button>`,
			importer: `import * as UI from 'shared/ui/button'`,
			tag: `<UI.Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "export star",
			definition: `export * from './leaf';`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			kind: "supported",
		},
		{
			name: "mutable component binding",
			definition: `export let Button = ({label}) => <button>{label}</button>`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			kind: "refused",
		},
		{
			name: "defaulted parameter",
			definition: `export const Button = ({label='Same'}) => <button>{label}</button>`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button/>`,
			kind: "refused",
		},
		{
			name: "spread override",
			definition: `export const Button = ({label}) => <button>{label}</button>`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button {...{label:'Same'}}/>`,
			kind: "refused",
		},
		{
			name: "coincidentally equal transform",
			definition: `export const Button = ({label}) => <button>{label.trim()}</button>`,
			importer: `import {Button} from 'shared/ui/button'`,
			tag: `<Button label="Same"/>`,
			kind: "refused",
		},
	] as const;
	const results = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/button.tsx": sample.definition,
			"shared/ui/leaf.tsx": `export const Button=({label})=><button>{label}</button>`,
			"frames/home/frame.tsx": `${sample.importer}; export default () => <main>${sample.tag}</main>`,
		});
		const mounted = await mount(browser, root, "home", "observed");
		const result = await read(mounted, await select(mounted, "selector" in sample ? sample.selector : "button"), {
			kind: "text",
		});
		expect(result.kind, sample.name).toBe(sample.kind);
		results.push({ name: sample.name, result });
		await mounted.page.close();
	}
	evidence.syntax = results;
});

it("keeps uncommitted Suspense work out of observations and preserves the old content during a transition", async () => {
	const root = project({
		"frames/home/frame.tsx": `import {Suspense,startTransition,useState} from 'react'; let ready=false; let done; const gate=new Promise(resolve=>done=resolve); function Wait(){if(!ready)throw gate;return <i>Resolved</i>} function Next(){return <section><button>Candidate</button><Wait/></section>} export default function Frame(){const [next,setNext]=useState(false);globalThis.resolveGate=()=>{ready=true;done()};return <main><a id="next" onClick={()=>startTransition(()=>setNext(true))}>Next</a><Suspense fallback={<p>Fallback</p>}>{next?<Next/>:<button>Committed</button>}</Suspense></main>}`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed");
	const old = await select(observed, 'button:text-is("Committed")');
	const outcomes = [];
	for (const mounted of [normal, observed]) {
		await mounted.page.locator("#next").click();
		expect(await mounted.page.locator("button").allTextContents()).toEqual(["Committed"]);
		if (mounted.observed) expect(await stillSelected(mounted, old)).toBe(true);
		await mounted.page.evaluate("resolveGate()");
		await mounted.page.locator('i:text-is("Resolved")').waitFor();
		outcomes.push(await mounted.page.locator("button,i").allTextContents());
	}
	expect(outcomes[0]).toEqual(outcomes[1]);
	expect(await stillSelected(observed, old)).toBe(false);
	supported(await read(observed, await select(observed, "button"), { kind: "text" }));
	evidence.suspense = { outcomes, uncommittedCandidateObserved: false, oldOccurrenceRetired: true };
	await normal.page.close();
	await observed.page.close();
});

it("reads literal attributes and absent slots while preserving expressions", async () => {
	const root = project({
		"shared/ui/link.tsx": `export const Link=()=> <a href="/download" title="Download">Link</a>;`,
		"frames/home/frame.tsx": `import {Link} from 'shared/ui/link';export default ()=> <main><Link/><img alt="Example"/><a title={'Same'.trim()}>Expression</a></main>`,
	});
	const mounted = await mount(browser, root, "home", "observed");
	const results = [];
	for (const [selector, attribute] of [
		["a:first-child", "href"],
		["a:first-child", "title"],
		["img", "alt"],
		["img", "title"],
	] as const)
		results.push(supported(await read(mounted, await select(mounted, selector), { kind: "attribute", attribute })));
	const expression = await read(mounted, await select(mounted, "a:last-child"), {
		kind: "attribute",
		attribute: "title",
	});
	expect(expression.kind).toBe("refused");
	evidence.attributes = { results, expression };
	await mounted.page.close();
});

it("leaves an existing DevTools hook intact and disables attribution rather than disrupting React", async () => {
	const page = await browser.newPage();
	await page.evaluate(() => {
		Reflect.set(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", { sentinel: true });
	});
	await page.evaluate(installObserver);
	const state = await page.evaluate(() => ({
		hook: Reflect.get(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__") as unknown,
		failure: globalThis.__handObserver.failure,
	}));
	expect(state.hook).toEqual({ sentinel: true });
	expect(state.failure).toContain("existing DevTools");
	evidence.existingHook = state;
	await page.close();
});

it("retains basic breakpoint/state scopes and maps logical sides from the actual writing environment", async () => {
	const results = [];
	for (const [direction, writingMode, physical] of [
		["ltr", "horizontal-tb", "left"],
		["rtl", "horizontal-tb", "right"],
		["ltr", "vertical-rl", "top"],
		["rtl", "vertical-lr", "bottom"],
	]) {
		const root = project({
			"frames/home/frame.tsx": `export default ()=> <main dir="${direction}" style={{writingMode:'${writingMode}'}}><button className="ps-4 md:ps-8 focus:ps-12">Scope</button></main>`,
		});
		const mounted = await mount(browser, root, "home", "observed");
		const selection = await select(mounted, "button");
		const base = supported(
			await read(mounted, selection, { kind: "property", property: `padding-${physical}`, scope: "" }),
		);
		expect(base.property?.owner?.token).toBe("ps-4");
		const md = supported(
			await read(mounted, selection, { kind: "property", property: `padding-${physical}`, scope: "md:" }),
		);
		expect(md.property?.owner?.token).toBe("md:ps-8");
		await mounted.page.locator("button").focus();
		const focus = supported(
			await read(mounted, selection, { kind: "property", property: `padding-${physical}`, scope: "focus:" }),
		);
		expect(focus.property?.owner?.token).toBe("focus:ps-12");
		expect(focus.property?.computed).toBe("48px");
		results.push({ direction, writingMode, base, md, focus });
		await mounted.page.close();
	}
	const root = project({
		"frames/home/frame.tsx": `export default ()=> <main><button id="important" className="p-4!">Important</button><button id="mixed" className="p-4! pt-8">Mixed</button></main>`,
	});
	const mounted = await mount(browser, root, "home", "observed");
	const important = supported(
		await read(mounted, await select(mounted, "#important"), {
			kind: "property",
			property: "padding-left",
			scope: "",
		}),
	);
	expect(important.property?.owner?.important).toBe(true);
	const mixed = await read(mounted, await select(mounted, "#mixed"), {
		kind: "property",
		property: "padding-top",
		scope: "",
	});
	expect(supported(mixed).property?.owner?.token).toBe("p-4!");
	const custom = await read(mounted, await select(mounted, "#important"), {
		kind: "property",
		property: "padding-left",
		scope: "group-hover:",
	});
	expect(custom.kind).toBe("refused");
	evidence.scopes = { results, important, mixed, custom };
	await mounted.page.close();
});
