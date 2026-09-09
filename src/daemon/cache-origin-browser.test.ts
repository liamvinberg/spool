import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, expect, it, onTestFinished } from "vitest";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler, designBuildOptions } from "./compile";
import { Sources, sourceRead } from "./source-origins";

let browser: Browser | undefined;
afterAll(async () => browser?.close());
const carrier = `function Pass({children}){globalThis.saved??=children;return globalThis.saved}`;
const button = `const Button=({label})=><button className="p-4" title={label}>{label}</button>;`;
const refusal = "committed cache read is known; external slot writes and props-field lifetime are not covered";

async function fixture(source: string) {
	if (!browser) browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "home", source);
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":700,"h":500}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	page.setDefaultTimeout(5000);
	const normal = await browser.newPage();
	onTestFinished(async () => {
		await page.close();
		await normal.close();
	});
	const options = designBuildOptions({
		designDir: join(project.root, "design"),
		resolveDir: join(project.root, "design/frames/home"),
		sourcefile: "ordinary.tsx",
		contents: `import {createElement} from 'react';import {createRoot} from 'react-dom/client';import Frame from './frame';const root=createRoot(document.getElementById('root'));globalThis.rerender=()=>root.render(createElement(Frame));globalThis.rerender();`,
		label: "ordinary",
	});
	const ordinary = await build({
		...options,
		plugins: options.plugins?.filter((p) => p.name === "spool-shared") ?? [],
		packages: "bundle",
		nodePaths: [join(process.cwd(), "node_modules")],
		jsxImportSource: "react",
		jsxDev: false,
	});
	await normal.setContent('<div id="root"></div>');
	await normal.addScriptTag({
		type: "module",
		content: ordinary.outputFiles!.find((f) => f.path.endsWith(".js"))!.text,
	});
	await normal.locator("main").waitFor();
	await page.goto(`${project.url}/p/${project.name}`);
	const frame = page.frameLocator('iframe[title="home"]');
	await frame.locator("main").waitFor({ timeout: 30000 });
	const mounted = page.frames().find((frame) => frame.url().includes("/frames/home"));
	if (!mounted) throw new Error("missing served frame");
	const file = join(project.root, "design/frames/home/frame.tsx");
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(project.root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("missing production compilation");
	return { page, normal, frame, mounted, project, file, source, compilation };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function act(f: Fixture, expression: string) {
	for (const surface of [f.normal, f.mounted]) {
		await surface.evaluate(expression);
		await surface.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
	}
}
async function observations(f: Fixture) {
	return f.frame
		.locator("button")
		.evaluateAll((elements) => elements.map((element) => globalThis.__SPOOL_OBSERVER__.observe(element)));
}
async function events(f: Fixture) {
	return f.mounted.evaluate(() => globalThis.__SPOOL_VALUES__!.cacheEvents());
}
async function parity(f: Fixture) {
	const snapshot = () => ({
		buttons: [...document.querySelectorAll("button")].map((el) => el.textContent),
		input: document.querySelector("input")?.value,
		gets: Reflect.get(globalThis, "gets"),
		sets: Reflect.get(globalThis, "sets"),
		mounts: Reflect.get(globalThis, "mounts"),
		refs: Reflect.get(globalThis, "refs"),
		state: document.querySelector("output")?.textContent,
	});
	expect(await f.mounted.evaluate(snapshot)).toEqual(await f.normal.evaluate(snapshot));
}
async function refuse(f: Fixture, expected = refusal) {
	await f.page.bringToFront();
	await f.page.mouse.click(500, 750);
	await f.page.getByRole("button", { name: "select", exact: true }).click();
	const box = await f.frame.locator("button").first().boundingBox();
	if (!box) throw new Error("missing button");
	await f.page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
	await f.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await f.page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
	await f.page.getByRole("button", { name: "edit", exact: true }).click();
	const selected = await f.frame.locator("button").first().boundingBox();
	if (!selected) throw new Error("missing selected button");
	await f.page.mouse.click(selected.x + selected.width / 2, selected.y + selected.height / 2);
	await expect.poll(() => f.page.locator('[data-hand-refusal="source"]').textContent()).toBe(expected);
	expect(await f.frame.locator("button").first().getAttribute("contenteditable")).toBeNull();
	expect(readFileSync(f.file, "utf8")).toBe(f.source);
	// The same production resolver also refuses other operation families from
	// these real committed observations, even though their UI ships separately.
	for (const observation of await observations(f)) {
		for (const operation of [
			{ kind: "text" },
			{ kind: "attribute", attribute: "title" },
			{ kind: "property", property: "padding-top", scope: "" },
			{ kind: "delete" },
		] as const)
			expect(() =>
				sourceRead(new Sources(f.project.root, f.compilation), { ...observation, generation: "1" }, operation),
			).toThrow();
	}
	await f.page.keyboard.press("Escape");
}

it("records actual assignments and committed reads while refusing external same-value stores", {
	timeout: 90000,
}, async () => {
	const f = await fixture(
		`import {useState,useEffect,useRef} from 'react';globalThis.mounts=0;globalThis.refs=0;${button}${carrier}export default function Frame(){const [n,set]=useState(0);const ref=useRef(null);globalThis.flip=()=>set(n+1);useEffect(()=>{globalThis.mounts++;if(ref.current)globalThis.refs++},[]);return <main style={{padding:40}}><Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass><input id="input" ref={ref} defaultValue="Kept"/><output>{n}</output></main>}`,
	);
	for (const [index, action] of [
		null,
		"flip()",
		"globalThis.saved.props.label='Same';globalThis.saved=globalThis.saved;flip()",
		"globalThis.saved=undefined;flip()",
	].entries()) {
		if (action) await act(f, action);
		await parity(f);
		const all = await events(f),
			picks = await observations(f);
		expect(all.slice(-4).map((event) => event.kind)).toEqual(["assignment", "read", "assignment", "read"]);
		for (const [i, pick] of picks.entries()) {
			const invocation = pick.chain.find((call) => call.invocation?.reads.length)?.invocation;
			expect(invocation?.reads).toHaveLength(1);
			expect(invocation?.reads[0]).toEqual(all.at(i === 0 ? -3 : -1));
		}
		expect(all.at(-3)?.matchingAssignment).toBe(all.at(-1)?.matchingAssignment);
		expect(all.at(-1)?.revision).toBe(index === 3 ? 2 : 1);
		if (index === 2) expect(all.filter((event) => event.rhsEvaluated)).toHaveLength(1);
		await refuse(f);
	}
	// Reading evidence itself must not add commits, getters or effects, and a
	// native application input/focus/selection remains ordinary React behavior.
	await f.page.getByRole("button", { name: "select", exact: true }).click();
	const box = await f.frame.locator("main").boundingBox();
	if (!box) throw new Error("missing frame");
	await f.page.mouse.dblclick(box.x + 300, box.y + 150);
	await expect
		.poll(() => f.page.locator('iframe[title="home"]').evaluate((el) => getComputedStyle(el).pointerEvents))
		.toBe("auto");
	for (const surface of [f.frame, f.normal]) {
		await surface.locator("input").fill("Typed");
		await surface.locator("input").press("ArrowLeft");
	}
	const focused = () => ({
		value: document.querySelector("input")?.value,
		caret: document.querySelector("input")?.selectionStart,
		focused: document.activeElement?.id,
	});
	const before = await f.mounted.evaluate(focused);
	expect(before).toEqual(await f.normal.evaluate(focused));
	expect(before).toEqual({ value: "Typed", caret: 4, focused: "input" });
	const commits = await f.mounted.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits);
	await observations(f);
	expect(await f.mounted.evaluate(focused)).toEqual(before);
	expect(await f.mounted.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits)).toBe(commits);
	await parity(f);
});

it.each(["stored", "ignored", "thrown"])(
	"preserves cache getter/setter evaluation and %s write results",
	{ timeout: 90000 },
	async (mode) => {
		const f = await fixture(
			`globalThis.gets=0;globalThis.sets=0;let saved;Object.defineProperty(globalThis,'saved',{get(){globalThis.gets++;return saved},set(value){globalThis.sets++;${mode === "thrown" ? "throw new Error('denied')" : mode === "ignored" ? "void value" : "saved=value"}},configurable:true});${button}${carrier}globalThis.tryPass=()=>{try{const child=<Button label="Same"/>;return Pass({children:child})===child?'same object':'not stored'}catch(error){return error.message}};export default function Frame(){return <main style={{padding:40}}><input id="input"/></main>}`,
		);
		const snapshot = () => ({
			first: Reflect.get(globalThis, "tryPass")(),
			second: Reflect.get(globalThis, "tryPass")(),
			gets: Reflect.get(globalThis, "gets"),
			sets: Reflect.get(globalThis, "sets"),
		});
		expect(await f.mounted.evaluate(snapshot)).toEqual(await f.normal.evaluate(snapshot));
		const all = await events(f);
		expect(all.filter((event) => event.kind === "read")).toHaveLength(mode === "thrown" ? 0 : 2);
		if (mode === "ignored")
			expect(
				all.filter((event) => event.kind === "read").every((event) => event.matchingAssignment === undefined),
			).toBe(true);
		if (mode === "thrown") expect(all).toEqual([]);
		expect(readFileSync(f.file, "utf8")).toBe(f.source);
	},
);

it("discards speculative cache invocation ownership while preserving actual later consumption", {
	timeout: 90000,
}, async () => {
	const f = await fixture(
		`import {Suspense,startTransition,useState} from 'react';let ready=false;let resolve;const pending=new Promise(r=>resolve=r);globalThis.release=()=>{ready=true;resolve()};${button}${carrier}function Gate({mode}){if(mode===1&&!ready)throw pending;return <i>Ready</i>}function Content({mode}){globalThis.attempts??=[];globalThis.attempts.push(mode);return <><Pass>{mode===0?<Button label="Old"/>:mode===1?<Button label="Pending"/>:<Button label="Urgent"/>}</Pass><Gate mode={mode}/></>}export default function Frame(){const [mode,set]=useState(0);globalThis.pending=()=>{globalThis.saved=undefined;startTransition(()=>set(1))};globalThis.urgent=()=>set(2);return <main style={{padding:40}}><Suspense fallback={<b>Loading</b>}><Content mode={mode}/></Suspense><input id="input"/></main>}`,
	);
	const initial = await observations(f),
		commits = await f.mounted.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits);
	await act(f, "pending()");
	for (const surface of [f.mounted, f.normal])
		await surface.waitForFunction(() => Reflect.get(globalThis, "attempts").includes(1));
	await parity(f);
	expect(await observations(f)).toEqual(initial);
	expect(await f.mounted.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits)).toBe(commits);
	const first = initial[0]?.chain.find((call) => call.invocation?.reads.length)?.invocation;
	expect(first?.reads).toHaveLength(1);
	const speculative = await events(f);
	expect(speculative.filter((event) => event.rhsEvaluated)).toHaveLength(2);
	await act(f, "urgent()");
	await act(f, "release()");
	await expect.poll(() => f.frame.locator("button").textContent()).toBe("Pending");
	await parity(f);
	const current = (await observations(f))[0]?.chain.find((call) => call.invocation?.reads.length)?.invocation;
	expect(current?.reads).toHaveLength(1);
	expect(current?.id).not.toBe(first?.id);
	expect(current?.reads[0]?.sequence).toBeGreaterThan(speculative.at(-1)!.sequence);
	expect(current?.reads[0]?.matchingAssignment).toBe(
		speculative.find((event) => event.rhsEvaluated && event.revision === 2)?.sequence,
	);
	await refuse(f);
});

it("reuses the original committed cache read through memo bailout and external mutation", {
	timeout: 90000,
}, async () => {
	const f = await fixture(
		`import {memo,useState} from 'react';${button}${carrier}const Memo=memo(Pass,()=>true);export default function Frame(){const [n,set]=useState(0);globalThis.flip=()=>set(n+1);return <main style={{padding:40}}>{n?<Memo><Button label="Same"/></Memo>:<Memo><Button label="Same" /></Memo>}<input id="input"/><output>{n}</output></main>}`,
	);
	const first = (await observations(f))[0]?.chain.find((call) => call.invocation?.reads.length)?.invocation;
	expect(first?.reads).toHaveLength(1);
	for (const [index, action] of [
		null,
		"flip()",
		"globalThis.saved.props.label='Changed';flip()",
		"globalThis.saved=undefined;flip()",
	].entries()) {
		if (action) await act(f, action);
		await parity(f);
		const pick = (await observations(f))[0];
		expect(pick?.chain.find((call) => call.invocation?.reads.length)?.invocation).toEqual(first);
		expect(await events(f)).toHaveLength(2);
		if (index === 2) {
			const leaf = pick?.chain.find((call) => call.invocation?.input?.fields.label);
			expect(leaf?.invocation?.input?.fields.label?.value).toBe("Same");
			expect(leaf?.renderedValues?.fields.label?.value).toBe("Changed");
			expect(await f.frame.locator("button").textContent()).toBe("Same");
		}
		await refuse(f);
	}
});

it.each([
	{
		name: "lexically shadowed globalThis",
		setup: "const globalThis={};",
		pass: carrier,
		reason: "cache return has no committed invocation read witness",
	},
	{
		name: "shadowed parameter",
		setup: "const storage={};",
		pass: "function Pass({children,globalThis=storage}){globalThis.saved??=children;return globalThis.saved}",
		reason: "cache return has no committed invocation read witness",
	},
	{
		name: "unproved cache alias",
		setup: "",
		pass: "function Pass({children}){const alias=globalThis;alias.saved??=children;return alias.saved}",
		reason: "mounted call relationship is not a verified children passthrough",
	},
	{
		name: "escaped cache return",
		setup: "const opaque=Function('value','return value');",
		pass: "function Pass({children}){globalThis.saved??=children;return opaque(globalThis.saved)}",
		reason: "mounted call relationship is not a verified children passthrough",
	},
])("refuses $name without fabricated reads or changed application behavior", { timeout: 90000 }, async (sample) => {
	const f = await fixture(
		`${sample.setup}${button}${sample.pass}export default function Frame(){return <main style={{padding:40}}><Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass><input id="input"/></main>}`,
	);
	await parity(f);
	expect(await events(f)).toEqual([]);
	for (const observation of await observations(f))
		expect(observation.chain.some((call) => call.invocation?.reads.length)).toBe(false);
	await refuse(f, sample.reason);
});

it("refuses an actual Properties title edit from a committed cache without a direct-cell fallback", {
	timeout: 90000,
}, async () => {
	const f = await fixture(
		`${button.replace("title={label}", 'title="Same"')}${carrier}export default function Frame(){return <main style={{padding:40}}><Pass><Button label="Same"/></Pass><input id="input"/></main>}`,
	);
	await f.page.bringToFront();
	await f.page.mouse.click(500, 750);
	await f.page.getByRole("button", { name: "select", exact: true }).click();
	const box = await f.frame.locator("button").boundingBox();
	if (!box) throw new Error("missing button");
	await f.page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
	await f.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await f.page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
	const field = f.page.getByRole("textbox", { name: "title", exact: true });
	await field.waitFor();
	const requested = f.page.waitForResponse(
		(response) =>
			response.url().endsWith("/source") &&
			response.request().postData()?.includes('"action":"read"') === true &&
			response.request().postData()?.includes('"field":"title"') === true,
	);
	await field.fill("Must not save");
	await field.press("Enter");
	expect(await (await requested).json()).toMatchObject({ ok: false, reason: refusal });
	expect(readFileSync(f.file, "utf8")).toBe(f.source);
	expect(await f.frame.locator("button").getAttribute("title")).toBe("Same");
	await parity(f);
});
