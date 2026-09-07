import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { type Mounted, mount, read, select, stillSelected } from "./automatic-browser";
import { RENDERER_SHA256 } from "./reconciled-renderer";
import { replacementCases } from "./replacement-cases";
import { REACT_SHA256, valueReact } from "./value-flow-build";

const evidence: Record<string, unknown> = {};
const roots: string[] = [];
let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	evidence.environment = {
		react: JSON.parse(readFileSync("node_modules/react/package.json", "utf8")).version as unknown,
		reactSha256: REACT_SHA256,
		rendererSha256: RENDERER_SHA256,
		browser: browser.version(),
	};
});
afterAll(async () => {
	await browser?.close();
	if (process.env.VALUE_EVIDENCE)
		writeFileSync(
			process.env.VALUE_EVIDENCE,
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
async function act(mounted: Mounted, action: string) {
	await mounted.page.evaluate(action);
	await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}
async function display(mounted: Mounted) {
	return mounted.page.evaluate(() => ({
		html: document.querySelector("#root")?.innerHTML,
		input: (document.querySelector("input") as HTMLInputElement | null)?.value,
		focus: document.activeElement?.id,
		contract: Reflect.get(globalThis, "contract") as unknown,
	}));
}

it("proves same-expression retained literals while refusing a different equal-valued expression", async () => {
	const outcomes = [];
	for (const comparator of ["", ",()=>true"]) {
		const source = `import {memo,useState} from 'react';const Button=({label})=><button className="p-4">{label}</button>;const Memo=memo(Button${comparator});
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(x=>!x);return <main>{flip ? <Memo label="Same"/> : <Memo label="Same" />}<input id="input" defaultValue="Kept"/></main>}`;
		const root = project({ "frames/home/frame.tsx": source });
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "values");
		const steps = [];
		for (const action of [null, "rerender()", "flip()", "rerender()", "flip()", "rerender()"]) {
			if (action)
				for (const mounted of [normal, observed]) {
					await mounted.page.locator("input").fill("Typed");
					await act(mounted, action);
				}
			expect(await display(observed)).toEqual(await display(normal));
			const pick = await select(observed, "button");
			const text = await read(observed, pick, { kind: "text" });
			expect(text.kind, JSON.stringify(text)).toBe(
				steps.length === 2 || steps.length === 3 ? "refused" : "supported",
			);
			const style = await read(observed, pick, { kind: "property", property: "padding-top", scope: "" });
			expect(style.kind).toBe("supported");
			steps.push({ action, pick, text, style });
		}
		outcomes.push({ comparator: comparator || "default", steps });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.retained = outcomes;
});

it("records an equal-valued clone override separately from preserved fields", async () => {
	const source = `import {cloneElement} from 'react';const Button=({label})=><button className="p-4">{label}</button>;
const Pass=({children})=>cloneElement(children,{label:'Same'});
export default function Frame(){return <main><Pass><Button label="Same"/></Pass><input id="input"/></main>}`;
	const root = project({ "frames/home/frame.tsx": source });
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "values");
	expect(await display(observed)).toEqual(await display(normal));
	const pick = await select(observed, "button");
	expect(pick.refusal).toBeUndefined();
	const cloned = pick.chain.at(-1)?.values;
	expect(cloned?.kind).toBe("clone");
	expect(cloned?.fields.label?.origin).toMatchObject({
		kind: "clone",
		source: expect.stringContaining("frame.tsx:2:"),
		via: [{ replaced: true }],
	});
	const text = await read(observed, pick, { kind: "text" });
	expect(text, JSON.stringify(text)).toMatchObject({
		kind: "supported",
		target: { role: "definition", syntax: "react-call", expected: "Same" },
	});
	evidence.equalClone = { pick, text };
	await normal.page.close();
	await observed.page.close();
});

it("reads all sixteen replacement and transport cases from the selected committed occurrence", async () => {
	const outcomes = [];
	const allRefused = new Set([
		"clone replaces named slot",
		"recreated component has no observed creation",
		"cached first child between different callers",
	]);
	for (const sample of replacementCases) {
		const source = `import {Children,cloneElement,createElement,useState} from 'react';
const Button=({label})=><button className="p-4">{label}</button>;const Header=({header})=>header;
function Pass({children,header,footer,flip}){${sample.body}}
export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(x=>!x);return <main>${sample.call}<input id="input" defaultValue="Kept"/></main>}`;
		const root = project({ "frames/home/frame.tsx": source });
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "values");
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
					{ kind: "reorder" },
					{ kind: "property", property: "padding-top", scope: "" },
				] as const) {
					const value = await read(observed, pick, operation);
					const refused =
						allRefused.has(sample.name) ||
						operation.kind === "delete" ||
						operation.kind === "reorder" ||
						(operation.kind === "property" && sample.name.includes("inline style"));
					expect(value.kind, `${sample.name}, ${operation.kind}: ${JSON.stringify(value)}`).toBe(
						refused ? "refused" : "supported",
					);
					if (value.kind === "supported") {
						const expected =
							operation.kind === "property"
								? sample.name === "clone replaces class and preserves children"
									? "p-8"
									: "p-4"
								: ["clone replaces label", "clone replaces children and preserves style"].includes(sample.name)
									? "Changed"
									: "Same";
						expect(value.target.expected).toBe(expected);
						expect(value.proof.selection.generation).toBe(observed.generation);
						expect(value.proof.committedRender).toBeGreaterThan(0);
						expect(value.proof.revisions.map((r) => r.path).sort()).toEqual([
							"frames/home/frame.tsx",
							"shared/tokens.css",
						]);
						// Source addresses are asserted against the literal author, not DOM order.
						if (operation.kind === "property" && sample.name === "clone replaces class and preserves children")
							expect(value.target.address.start).toBe(source.indexOf("cloneElement(children"));
						if (
							operation.kind === "text" &&
							[
								"clone replaces label",
								"clone replaces equal label",
								"clone replaces children and preserves style",
							].includes(sample.name)
						) {
							expect(value.target.role).toBe("definition");
							expect(value.target.address.start).toBe(source.indexOf("cloneElement(children"));
						}
						if (operation.kind === "text" && sample.name === "Children.toArray creates keyed elements") {
							const first = source.indexOf('<Button label="Same"/>');
							expect(value.target.address.start).toBe(
								index === 0 ? first : source.indexOf('<Button label="Same"/>', first + 1),
							);
						}
					}
					reads.push({ index, pick, operation, value });
				}
			}
			steps.push({ action, reads, display: await display(observed) });
		}
		outcomes.push({ name: sample.name, steps });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.replacements = outcomes;
}, 60000);

it("separates changed default/custom memo inputs and local state from source literals", async () => {
	const outcomes = [];
	for (const stateful of [false, true])
		for (const comparator of ["", ",()=>true"]) {
			const button = stateful
				? `function Button({label}){const [n,set]=useState(0);globalThis.increment=()=>set(x=>x+1);return <button className="p-4"><span>{label}</span><b>{n}</b></button>}`
				: `const Button=({label})=><button className="p-4">{label}</button>`;
			const source = `import {memo,useState} from 'react';${button};const Memo=memo(Button${comparator});
export default function Frame(){const [flip,set]=useState(false);globalThis.flip=()=>set(x=>!x);return <main>{flip?<Memo label="New"/>:<Memo label="Old"/>}<input id="input" defaultValue="Kept"/></main>}`;
			const root = project({ "frames/home/frame.tsx": source }),
				normal = await mount(browser, root, "home", false),
				observed = await mount(browser, root, "home", "values");
			const steps = [];
			for (const action of [null, "flip()", ...(stateful ? ["increment()"] : []), "rerender()"]) {
				if (action)
					for (const mounted of [normal, observed]) {
						await mounted.page.locator("input").fill("Typed");
						await act(mounted, action);
					}
				expect(await display(observed)).toEqual(await display(normal));
				const pick = await select(observed, stateful ? "span" : "button"),
					text = await read(observed, pick, { kind: "text" });
				expect(text.kind).toBe(stateful || (comparator !== "" && action !== null) ? "refused" : "supported");
				if (action !== null) {
					const call = pick.chain.at(-1)!;
					expect(call.values?.fields.label?.value).toBe("New");
					expect(call.renderedValues?.fields.label?.value).toBe(comparator ? "Old" : "New");
				}
				const style = await read(observed, await select(observed, "button"), {
					kind: "property",
					property: "padding-top",
					scope: "",
				});
				expect(style.kind).toBe("supported");
				steps.push({ action, pick, text, style });
			}
			outcomes.push({ stateful, comparator: comparator || "default", steps });
			await normal.page.close();
			await observed.page.close();
		}
	evidence.changedMemo = outcomes;
});

it("publishes only committed clone fields through pending, resolved and abandoned transitions", async () => {
	const source = `import {cloneElement,memo,Suspense,startTransition,useState} from 'react';
let ready=false;let resolve;const pending=new Promise(r=>resolve=r);globalThis.release=()=>{ready=true;resolve()};
const Button=({label})=><button className="p-4">{label}</button>;const Memo=memo(Button);const Pass=({children})=>cloneElement(children);
function Gate({mode}){if(mode===1&&!ready)throw pending;return <i>Ready</i>}
function Content({mode}){globalThis.attempts??=[];globalThis.attempts.push(mode);return <><Pass>{mode===0?<Memo label="Old"/>:mode===1?<Memo label="Pending"/>:<Memo label="Urgent"/>}</Pass><Gate mode={mode}/></>}
export default function Frame(){const [mode,set]=useState(0);globalThis.pending=()=>startTransition(()=>set(1));globalThis.urgent=()=>set(2);return <main><Suspense fallback={<b>Loading</b>}><Content mode={mode}/></Suspense><input id="input" defaultValue="Kept"/></main>}`;
	const outcomes = [];
	for (const abandon of [false, true]) {
		const root = project({ "frames/home/frame.tsx": source }),
			normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "values");
		const initial = await select(observed, "button"),
			text = await read(observed, initial, { kind: "text" });
		expect(text.kind, JSON.stringify(text)).toBe("supported");
		const commits = await observed.page.evaluate(() => globalThis.__handObserver.commits);
		for (const mounted of [normal, observed]) {
			await mounted.page.locator("input").fill("Typed");
			await act(mounted, "pending()");
			await mounted.page.waitForFunction(() => (Reflect.get(globalThis, "attempts") as number[]).includes(1));
		}
		expect(await display(observed)).toEqual(await display(normal));
		expect(await select(observed, "button")).toEqual(initial);
		expect(await observed.page.evaluate(() => globalThis.__handObserver.commits)).toBe(commits);
		for (const mounted of [normal, observed]) {
			if (abandon) await act(mounted, "urgent()");
			await act(mounted, "release()");
			await mounted.page.locator(`button:text-is("${abandon ? "Urgent" : "Pending"}")`).waitFor();
		}
		expect(await display(observed)).toEqual(await display(normal));
		const pick = await select(observed, "button"),
			after = await read(observed, pick, { kind: "text" });
		expect(after).toMatchObject({
			kind: "supported",
			target: { expected: abandon ? "Urgent" : "Pending", role: "call-site" },
		});
		expect(await stillSelected(observed, initial)).toBe(false);
		outcomes.push({ abandon, initial, text, pick, after });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.transitions = outcomes;
}, 30000);

it("keeps keys, refs, getter effects and native state identical to ordinary production calls", async () => {
	const source = `import {Children,cloneElement,createElement,useEffect,useRef,useState} from 'react';
const Button=({label,ref})=><button ref={ref}>{label}</button>;
function Pass({children}){globalThis.gets=0;const config={get label(){globalThis.gets++;return 'Same'},ref:globalThis.replaceRef?globalThis.nextRef:undefined,key:'new'};const copy=cloneElement(children,config);const array=Children.toArray([copy]);globalThis.copies=[children,copy,array[0]];globalThis.contract={gets:globalThis.gets,type:copy.type===children.type,props:Object.keys(copy.props).sort(),children:copy.props.children===children.props.children,ref:copy.props.ref===children.props.ref,keys:[children.key,copy.key,array[0].key]};return array}
export default function Frame(){const ref=useRef(null),nextRef=useRef(null);globalThis.nextRef=nextRef;const [n,set]=useState(0);globalThis.increment=()=>set(x=>x+1);useEffect(()=>{globalThis.contract.mountedRef=ref.current?.tagName;globalThis.contract.replacementRef=nextRef.current?.tagName});return <main><Pass><Button key="old" ref={ref} label="Same">Child</Button></Pass><b>{n}</b><input id="input" defaultValue="Kept"/></main>}`;
	const root = project({ "frames/home/frame.tsx": source }),
		normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "values");
	const steps = [];
	for (const action of [null, "increment()", "globalThis.replaceRef=true;rerender()"]) {
		if (action)
			for (const mounted of [normal, observed]) {
				await mounted.page.locator("input").fill("Typed");
				await act(mounted, action);
			}
		expect(await display(observed)).toEqual(await display(normal));
		const snapshots = await observed.page.evaluate(() =>
			(Reflect.get(globalThis, "copies") as import("./value-flow").ValueElement[]).map(
				(el) => globalThis.__handValues!.snapshot(el)!,
			),
		);
		expect(snapshots[1]!.fields.label?.origin.kind).toBe("clone");
		expect(snapshots[1]!.fields.ref?.origin.kind).toBe(action?.startsWith("globalThis.replaceRef") ? "clone" : "jsx");
		expect(snapshots[1]!.fields.children?.origin.kind).toBe("jsx");
		expect(snapshots[1]!.key?.origin.kind).toBe("clone");
		expect(snapshots[2]!.key?.origin.kind).toBe("key");
		expect(snapshots[2]!.fields.label?.origin.via.map((edge) => edge.kind)).toEqual(["clone", "key"]);
		const pick = await select(observed, "button"),
			text = await read(observed, pick, { kind: "text" });
		expect(text.kind).toBe("refused");
		steps.push({ action, snapshots, pick, text, display: await display(observed) });
	}
	evidence.reactParity = steps;
	await normal.page.close();
	await observed.page.close();
});

it("refuses same-valued mutation, cached aliases and indirect configs instead of borrowing a JSX author", async () => {
	const cases = [
		{ name: "mutated incoming props", body: `children.props.label='Same';return cloneElement(children)` },
		{
			name: "argument mutates same-valued field",
			body: `return cloneElement(children,{title:(children.props.label='Same','new')})`,
		},
		{ name: "cached alias", body: `globalThis.saved??=children;return cloneElement(globalThis.saved)` },
		{ name: "indirect config", body: `return cloneElement(children,globalThis.config)` },
	];
	const outcomes = [];
	for (const sample of cases) {
		const source = `import {cloneElement} from 'react';globalThis.config={label:'Same'};const Button=({label})=><button>{label}</button>;function Pass({children}){${sample.body}};export default function Frame(){return <main><Pass><Button label="Same"/></Pass></main>}`;
		const root = project({ "frames/home/frame.tsx": source }),
			normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "values");
		expect(await display(observed)).toEqual(await display(normal));
		const pick = await select(observed, "button"),
			text = await read(observed, pick, { kind: "text" });
		expect(text.kind, sample.name).toBe("refused");
		outcomes.push({ name: sample.name, pick, text });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.unsafeEquality = outcomes;
});

it("keeps keyed equal-label copies attached to separate authored targets after reorder", async () => {
	const source = `import {Children,useState} from 'react';const Button=({label})=><button className="p-4">{label}</button>;const Pass=({children})=>Children.toArray(children);
export default function Frame(){const [flip,set]=useState(false);globalThis.flip=()=>set(x=>!x);return <main>{flip?<Pass><Button key="b" label="Same"/><Button key="a" label="Same"/></Pass>:<Pass><Button key="a" label="Same" /><Button key="b" label="Same" /></Pass>}<input id="input"/></main>}`;
	const root = project({ "frames/home/frame.tsx": source }),
		normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "values");
	const before = [await select(observed, "button >> nth=0"), await select(observed, "button >> nth=1")];
	for (const mounted of [normal, observed]) await act(mounted, "flip()");
	expect(await display(observed)).toEqual(await display(normal));
	const after = [await select(observed, "button >> nth=0"), await select(observed, "button >> nth=1")];
	expect(after.map((p) => p.occurrence)).toEqual([before[1]!.occurrence, before[0]!.occurrence]);
	const reads = [];
	for (let index = 0; index < 2; index++) {
		const value = await read(observed, after[index]!, { kind: "text" });
		expect(value).toMatchObject({
			kind: "supported",
			target: {
				address: {
					start: source.indexOf(index === 0 ? '<Button key="b" label="Same"/>' : '<Button key="a" label="Same"/>'),
				},
				expected: "Same",
				role: "call-site",
			},
		});
		reads.push(value);
	}
	evidence.keyed = { before, after, reads };
	await normal.page.close();
	await observed.page.close();
});

it("retains caller, clone carrier, definition, imports and the owner-admission seam", async () => {
	const files = {
		"shared/ui/leaf.tsx": `export const Button=({label})=><button className="p-4">{label}</button>`,
		"shared/ui/exports.ts": `export {Button} from './leaf'`,
		"shared/ui/pass.tsx": `import {cloneElement} from 'react';export const Pass=({children})=>cloneElement(children,{label:'Override'})`,
		"shared/ui/bridge.ts": `export {Pass} from './pass'`,
		"frames/home/frame.tsx": `import {Button} from 'shared/ui/exports';import {Pass} from 'shared/ui/bridge';export default function Frame(){return <main><Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass></main>}`,
	};
	const root = project(files);
	let admitted = true;
	const observed = await mount(browser, root, "home", "values", {
		capture: async (revisions) => ({
			epoch: "synthetic-value-owner",
			handles: revisions.map((r) => ({ path: r.path, handle: `owner:${r.path}`, revision: 1 })),
		}),
		valid: async (lease, revisions) =>
			admitted &&
			lease.epoch === "synthetic-value-owner" &&
			revisions.every((r) => lease.handles.some((h) => h.path === r.path)),
	});
	const pick = await select(observed, "button >> nth=0"),
		text = await read(observed, pick, { kind: "text" });
	expect(text).toMatchObject({
		kind: "supported",
		target: { role: "definition", source: expect.stringContaining("shared/ui/pass.tsx") },
		proof: { owner: { epoch: "synthetic-value-owner" } },
	});
	if (text.kind !== "supported") throw new Error(text.reason);
	expect(text.proof.revisions.map((r) => r.path).sort()).toEqual([...Object.keys(files), "shared/tokens.css"].sort());
	expect(text.proof.owner?.handles).toHaveLength(6);
	const other = await read(observed, await select(observed, "button >> nth=1"), { kind: "text" });
	expect(other).toMatchObject({ kind: "supported", target: { address: text.target.address } });
	admitted = false;
	expect(await stillSelected(observed, pick)).toBe(false);
	admitted = true;
	const retirements = [];
	for (const [path, source] of Object.entries({ ...files, "shared/tokens.css": "" })) {
		writeDesignFile(root, path, `${source}\n/* changed */`);
		expect(await stillSelected(observed, pick), path).toBe(false);
		writeDesignFile(root, path, source);
		retirements.push(path);
	}
	evidence.authority = {
		pick,
		text,
		other,
		retirements,
		boundary: "synthetic seam only; actual process admission and joined writes remain separate tasks",
	};
	await observed.page.close();
});

it("records the structural counterexample and refuses changed React factory bytes", async () => {
	const root = project({
		"frames/home/frame.tsx": `import {cloneElement} from 'react';const Pass=({children})=>cloneElement(children);globalThis.empty=()=>{try{Pass({});return 'unexpected success'}catch(error){return error.message}};export default function Frame(){return <main><Pass><button>Same</button></Pass></main>}`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "values");
	const plainError = await normal.page.evaluate("empty()"),
		observedError = await observed.page.evaluate("empty()");
	expect(observedError).toBe(plainError);
	expect(plainError).toContain("The argument must be a React element");
	const pick = await select(observed, "button"),
		deletion = await read(observed, pick, { kind: "delete" });
	expect(deletion).toMatchObject({
		kind: "refused",
		reason: expect.stringContaining("removing a clone input can throw"),
	});
	const fake = makeTempDir();
	writeFileSync(`${fake}/react.production.js`, "export const changed = true");
	await expect(
		build({
			entryPoints: [`${fake}/react.production.js`],
			write: false,
			bundle: true,
			plugins: [valueReact()],
			logLevel: "silent",
		}),
	).rejects.toThrow("exact pinned React bytes");
	evidence.gates = { plainError, observedError, pick, deletion, changedReactRefused: true };
	await normal.page.close();
	await observed.page.close();
});

it("keeps ordinary prop names separate from React type and key metadata", async () => {
	const source = `import {cloneElement} from 'react';const Button=({$key})=><button>{$key}</button>;const Pass=({children})=>cloneElement(children,{$key:'New prop'});export default function Frame(){return <main><Pass><Button key="Stable key" $key="Old prop" $type="Own type prop"/></Pass></main>}`;
	const root = project({ "frames/home/frame.tsx": source }),
		normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "values");
	expect(await display(observed)).toEqual(await display(normal));
	const pick = await select(observed, "button"),
		text = await read(observed, pick, { kind: "text" });
	expect(text).toMatchObject({
		kind: "supported",
		target: { expected: "New prop", attribute: "$key", role: "definition" },
	});
	const value = pick.chain.at(-1)?.values;
	expect(value?.fields.$key?.origin.kind).toBe("clone");
	expect(value?.fields.$type?.value).toBe("Own type prop");
	expect(value?.key.origin.kind).toBe("jsx");
	expect(value?.key.value).toBe("Stable key");
	expect(value?.type.origin.kind).toBe("jsx");
	evidence.metadata = { pick, text };
	await normal.page.close();
	await observed.page.close();
});
