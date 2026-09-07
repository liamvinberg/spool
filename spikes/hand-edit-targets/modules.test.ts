import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { type Mounted, mount, read, select, stillSelected } from "./automatic-browser";
import { type Operation, Sources } from "./automatic-source";

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
	if (process.env.MODULE_EVIDENCE)
		writeFileSync(
			process.env.MODULE_EVIDENCE,
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
	}));
}
const leaf = `export function Button({label}){return <button className="p-4">{label}</button>} export {Button as default};`;

it("resolves composite routes by binding identity, retaining losing branches and valid cycles", async () => {
	const cases = [
		{ name: "unique among two stars", barrel: `export * from './empty';export * from './leaf';`, call: "UI.Button" },
		{
			name: "diamond through imported alias",
			barrel: `export * from './alias';export * from './leaf';`,
			call: "UI.Button",
		},
		{ name: "valid cycle plus leaf", barrel: `export * from './cycle';export * from './leaf';`, call: "UI.Button" },
		{
			name: "nested namespace through star and rename",
			barrel: `export * from './nested';`,
			call: "UI.Widgets.Controls.Button",
		},
		{ name: "namespace default", barrel: `export * as Widgets from './leaf';`, call: "UI.Widgets.default" },
		{
			name: "explicit masks ambiguous stars",
			barrel: `export {Button} from './other';export * from './leaf';export * from './alias';`,
			call: "UI.Button",
			owner: "other.tsx",
		},
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/leaf.tsx": leaf,
			"shared/ui/other.tsx": leaf,
			"shared/ui/empty.ts": `export const nothing=1;`,
			"shared/ui/alias.ts": `import {Button as Original} from './leaf';export {Original as Button};`,
			"shared/ui/cycle.ts": `export * from './barrel';`,
			"shared/ui/controls.ts": `export * as Controls from './leaf';`,
			"shared/ui/nested.ts": `export * as Widgets from './controls';`,
			"shared/ui/barrel.ts": sample.barrel,
			"frames/home/frame.tsx": `import * as UI from 'shared/ui/barrel';export default ()=> <main><${sample.call} label="Same"/><${sample.call} label="Same"/></main>`,
		});
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "observed");
		expect(await display(observed), sample.name).toEqual(await display(normal));
		const first = supported(await readAt(observed, "button >> nth=0")),
			second = supported(await readAt(observed, "button >> nth=1"));
		expect(first.target.address.start).not.toBe(second.target.address.start);
		const style = supported(
			await readAt(observed, "button >> nth=1", { kind: "property", property: "padding-top", scope: "" }),
		);
		expect(style.target.address.file).toContain(sample.owner ?? "leaf.tsx");
		const deletion = supported(await readAt(observed, "button >> nth=1", { kind: "delete" }));
		const reorder = supported(await readAt(observed, "button >> nth=1", { kind: "reorder" }));
		expect(deletion.target.address).toEqual(second.target.address);
		expect(reorder.target.address).toEqual(second.target.address);
		// A higher-priority formerly absent import candidate changes resolution.
		writeDesignFile(root, "shared/ui/barrel.tsx", sample.barrel);
		expect(await stillSelected(observed, first.proof.selection)).toBe(false);
		outcomes.push({ name: sample.name, first, second, style, deletion, reorder, absentCandidateRetires: true });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.composite = outcomes;
}, 30000);

it("keeps distinct bindings ambiguous even when they hold the exact same function value", async () => {
	const root = project({
		"shared/ui/leaf.tsx": leaf,
		"shared/ui/copy.ts": `import {Button as Original} from './leaf';export const Button=Original;`,
		"shared/ui/barrel.ts": `export * from './leaf';export * from './copy';`,
		"frames/home/frame.tsx": `import {Button} from 'shared/ui/barrel';export default ()=> <main><Button label="Same"/></main>`,
	});
	const sources = new Sources(root);
	expect(sources.bindings.exported(sources.read("shared/ui/barrel.ts"), "Button")).toBe("ambiguous");
	for (const mode of [false, "observed"] as const)
		await expect(mount(browser, root, "home", mode)).rejects.toThrow("Ambiguous import");
	// Namespace imports themselves are valid; the ambiguous member is absent.
	writeDesignFile(
		root,
		"frames/home/frame.tsx",
		`import * as UI from 'shared/ui/barrel';export default ()=> <main><i>{String('Button' in UI)}</i></main>`,
	);
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed");
	expect(await observed.page.locator("i").textContent()).toBe("false");
	expect(await display(observed)).toEqual(await display(normal));
	evidence.sameValueAmbiguity = { binding: "ambiguous", directImport: "compile failure", namespaceMember: "absent" };
	await normal.page.close();
	await observed.page.close();
});

it("joins lazy defaults and named projections to committed source definitions without executing getters", async () => {
	const cases = [
		{
			name: "dynamic default through namespace",
			setup: `import {lazy} from 'react';const Pick=lazy(()=>import('shared/ui/barrel'));`,
			barrel: `export {Button as default} from './leaf';`,
		},
		{
			name: "named projection through diamond",
			setup: `import {lazy as deferred} from 'react';const Pick=deferred(()=>import('shared/ui/barrel').then(mod=>({default:mod.Button})));`,
			barrel: `export * from './leaf';export * from './alias';`,
		},
		{
			name: "resolved static namespace",
			setup: `import {lazy} from 'react';import * as UI from 'shared/ui/barrel';const Pick=lazy(()=>Promise.resolve(UI));`,
			barrel: `export {Button as default} from './leaf';`,
		},
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/leaf.tsx": `import {useState} from 'react';export function Button({label}){const [n,setN]=useState(0);return <button className="p-4" onClick={()=>setN(n+1)} data-count={n} ref={node=>{globalThis.refs=node?.tagName ?? null}}>{label}</button>}`,
			"shared/ui/alias.ts": `export {Button} from './leaf';`,
			"shared/ui/barrel.ts": sample.barrel,
			"frames/home/frame.tsx": `import {Suspense} from 'react';${sample.setup}export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/><Pick label="Same"/></Suspense><input id="input" defaultValue="Kept"/></main>`,
		});
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "observed");
		await normal.page.locator("button").first().waitFor();
		await observed.page.locator("button").first().waitFor();
		const first = supported(await readAt(observed, "button >> nth=0", { kind: "delete" })),
			second = supported(await readAt(observed, "button >> nth=1", { kind: "delete" }));
		expect(first.target.address.start).not.toBe(second.target.address.start);
		expect(second.proof.selection.chain.some((call) => call.lazyResolved)).toBe(true);
		expect(second.proof.admission).toHaveLength(1);
		expect(second.proof.admission[0]?.captured).toContain("shared/ui/leaf.tsx");
		const text = await readAt(observed, "button >> nth=1");
		expect(text).toMatchObject({ kind: "refused", reason: "text is not a direct immutable parameter or literal" });
		const style = supported(
			await readAt(observed, "button >> nth=1", { kind: "property", property: "padding-top", scope: "" }),
		);
		expect(style.target.address.file).toContain("shared/ui/leaf.tsx");
		const deletion = supported(await readAt(observed, "button >> nth=1", { kind: "delete" }));
		expect(deletion.target.address).toEqual(second.target.address);
		for (const mounted of [normal, observed]) {
			await mounted.page.locator("button").nth(1).click();
			await mounted.page.locator("input").fill("Typed");
		}
		expect(await display(observed)).toEqual(await display(normal));
		const after = supported(await readAt(observed, "button >> nth=1", { kind: "delete" }));
		expect(after.proof.selection.occurrence).toBe(second.proof.selection.occurrence);
		expect(await observed.page.locator("button").nth(1).getAttribute("data-count")).toBe("1");
		outcomes.push({
			name: sample.name,
			first,
			second,
			style,
			text,
			deletion,
			after,
			display: await display(observed),
		});
		await normal.page.close();
		await observed.page.close();
	}
	evidence.lazy = outcomes;
}, 30000);

it("refuses conditional and transformed loaders while retaining every literal dependency", async () => {
	const cases = [
		{
			name: "conditional modules choose other",
			loader: `()=>globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other')`,
		},
		{
			name: "conditional modules choose leaf",
			loader: `()=>!globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other')`,
		},
		{
			name: "conditional named projection",
			loader: `()=>import('shared/ui/leaf').then(mod=>({default:globalThis.choice?mod.Button:mod.default}))`,
		},
		{
			name: "getter projection",
			loader: `()=>import('shared/ui/leaf').then(mod=>({get default(){globalThis.reads=(globalThis.reads??0)+1;return mod.Button}}))`,
		},
		{ name: "namespace held in object", loader: `()=>Promise.resolve({default: UI.Button})` },
	];
	const outcomes = [];
	for (const sample of cases) {
		const root = project({
			"shared/ui/leaf.tsx": leaf,
			"shared/ui/other.tsx": leaf,
			"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';import * as UI from 'shared/ui/leaf';const Pick=lazy(${sample.loader});export default ()=> <main><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>`,
		});
		const normal = await mount(browser, root, "home", false),
			observed = await mount(browser, root, "home", "observed");
		await normal.page.locator("button").waitFor();
		await observed.page.locator("button").waitFor();
		const before = await display(observed),
			reads = [];
		for (const operation of [
			{ kind: "text" },
			{ kind: "delete" },
			{ kind: "property", property: "padding-top", scope: "" },
		] as const) {
			const value = await readAt(observed, "button", operation);
			expect(value.kind, sample.name).toBe("refused");
			reads.push(value);
		}
		expect(await display(observed)).toEqual(before);
		expect(before).toEqual(await display(normal));
		outcomes.push({ name: sample.name, reads, admission: observed.admission, display: before });
		await normal.page.close();
		await observed.page.close();
	}
	evidence.refusedLoaders = outcomes;
}, 30000);

it("admits compiler-discovered modules only through a fresh capture and rebuild", async () => {
	const root = project({
		"frames/home/parts/first.tsx": leaf,
		"frames/home/parts/second.tsx": leaf,
		"frames/home/frame.tsx": `import {lazy,Suspense} from 'react';globalThis.pick='first';const Pick=lazy(()=>import('./parts/'+globalThis.pick+'.tsx'));export default ()=> <main><span>Ready</span><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>`,
	});
	const captures: string[][] = [];
	const authority = {
		async capture(revisions: readonly { path: string }[]) {
			captures.push(revisions.map((value) => value.path));
			return {
				epoch: "probe",
				handles: revisions.map((value) => ({ path: value.path, handle: value.path, revision: 1 })),
			};
		},
		async valid(lease: { handles: { path: string }[] }, revisions: readonly { path: string }[]) {
			return (
				lease.handles.length === revisions.length &&
				revisions.every((value) => lease.handles.some((handle) => handle.path === value.path))
			);
		},
	};
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed", authority);
	await normal.page.locator("button").waitFor();
	await observed.page.locator("button").waitFor();
	expect(await display(observed)).toEqual(await display(normal));
	expect(captures).toHaveLength(2);
	expect(captures[0]).not.toContain("frames/home/parts/first.tsx");
	expect(captures[1]).toEqual(expect.arrayContaining(["frames/home/parts/first.tsx", "frames/home/parts/second.tsx"]));
	const accepted = supported(await readAt(observed, "span"));
	expect(accepted.proof.admission[0]?.discovered.sort()).toEqual([
		"frames/home/parts/first.tsx",
		"frames/home/parts/second.tsx",
	]);
	expect(accepted.proof.admission[1]?.discovered).toEqual([]);
	const dynamic = await readAt(observed, "button");
	expect(dynamic).toMatchObject({ kind: "refused", reason: expect.stringContaining("dynamic") });
	let failedCapture = 0;
	await expect(
		mount(browser, root, "home", "observed", {
			...authority,
			async capture(revisions) {
				if (++failedCapture === 2) throw new Error("owner refused newly discovered inputs");
				return authority.capture(revisions);
			},
		}),
	).rejects.toThrow("owner refused newly discovered inputs");
	writeDesignFile(root, "frames/home/parts/third.tsx", leaf);
	expect(await stillSelected(observed, accepted.proof.selection)).toBe(false);
	evidence.discovery = {
		newGlobMatchRetires: true,
		captures,
		accepted,
		dynamic,
		refusedExpansionBeforeDocument: true,
		limit: "structural authority double here; real disposable coordinator companion supplies owner evidence",
	};
	await normal.page.close();
	await observed.page.close();
});

it("never publishes suspended or abandoned lazy candidates as committed source targets", async () => {
	const root = project({
		"shared/ui/leaf.tsx": `export default function Button({label}){if(!globalThis.ready)throw globalThis.gate;return <button className="p-4">{label}</button>}`,
		"frames/home/frame.tsx": `import {lazy,Suspense,startTransition,useState} from 'react';const Pick=lazy(()=>import('shared/ui/leaf'));globalThis.ready=false;let finish;globalThis.gate=new Promise(resolve=>finish=resolve);globalThis.resolveGate=()=>{globalThis.ready=true;finish()};export default function Frame(){const [next,setNext]=useState(false);globalThis.next=()=>startTransition(()=>setNext(true));globalThis.abandon=()=>setNext(false);return <main><Suspense fallback={<i>Waiting</i>}>{next?<Pick label="Candidate"/>:<button>Committed</button>}</Suspense><input id="input" defaultValue="Kept"/></main>}`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed");
	const old = supported(await readAt(observed, "button"));
	for (const mounted of [normal, observed]) {
		await mounted.page.locator("input").fill("Typed");
		await mounted.page.evaluate("next()");
		await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	}
	expect(await observed.page.locator('button:text-is("Candidate")').count()).toBe(0);
	expect(await stillSelected(observed, old.proof.selection)).toBe(true);
	expect(await display(observed)).toEqual(await display(normal));
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("abandon()");
		await mounted.page.evaluate("resolveGate()");
		await mounted.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	}
	expect(await observed.page.locator('button:text-is("Candidate")').count()).toBe(0);
	expect(await stillSelected(observed, old.proof.selection)).toBe(true);
	const retained = supported(await readAt(observed, "button"));
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("next()");
		await mounted.page.locator('button:text-is("Candidate")').waitFor();
	}
	expect(await stillSelected(observed, old.proof.selection)).toBe(false);
	const committed = supported(
		await readAt(observed, "button", { kind: "property", property: "padding-top", scope: "" }),
	);
	expect(committed.proof.selection.chain.some((call) => call.lazyResolved)).toBe(true);
	expect(await display(observed)).toEqual(await display(normal));
	evidence.lazyCommit = {
		old,
		retained,
		committed,
		suspendedUnselectable: true,
		abandonedUnselectable: true,
		display: await display(observed),
	};
	await normal.page.close();
	await observed.page.close();
});

it("distinguishes same-named lazy exports and retires changed call and module relationships", async () => {
	const root = project({
		"shared/ui/leaf.tsx": leaf,
		"shared/ui/other.tsx": leaf.replace("className=", 'data-module="other" className='),
		"shared/ui/barrel.ts": `export {default} from './leaf';`,
		"frames/home/frame.tsx": `import {lazy,Suspense,useState} from 'react';const First=lazy(()=>import('shared/ui/barrel'));const Second=lazy(()=>import('shared/ui/other'));export default function Frame(){const [flip,setFlip]=useState(false);globalThis.flip=()=>setFlip(true);return <main><Suspense fallback={<i>Waiting</i>}>{flip?<Second label="Same"/>:<First label="Same"/>}</Suspense></main>}`,
	});
	const normal = await mount(browser, root, "home", false),
		observed = await mount(browser, root, "home", "observed");
	await normal.page.locator("button").waitFor();
	await observed.page.locator("button").waitFor();
	const before = supported(await readAt(observed, "button", { kind: "property", property: "padding-top", scope: "" }));
	expect(before.target.address.file).toContain("leaf.tsx");
	for (const mounted of [normal, observed]) {
		await mounted.page.evaluate("flip()");
		await mounted.page.locator('button[data-module="other"]').waitFor();
	}
	const after = supported(await readAt(observed, "button", { kind: "property", property: "padding-top", scope: "" }));
	expect(after.target.address.file).toContain("other.tsx");
	expect(await stillSelected(observed, before.proof.selection)).toBe(false);
	expect(await display(observed)).toEqual(await display(normal));
	writeDesignFile(root, "shared/ui/barrel.ts", `export {default} from './other';`);
	expect(await stillSelected(observed, after.proof.selection)).toBe(false);
	evidence.changedLazy = { before, after, changedRouteRetires: true };
	await normal.page.close();
	await observed.page.close();
});
