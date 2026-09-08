import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { afterAll, expect, it, onTestFinished } from "vitest";
import type { SourceRead } from "../source-edit";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { designBuildOptions } from "./compile";
import { assembleFrameDocument } from "./document";
import { consumedChoices, lazyChoices } from "./lazy-origin-cases";

let browser: Browser | undefined;
afterAll(async () => browser?.close());
const leaf = `globalThis.moduleInitializers=(globalThis.moduleInitializers??0)+1;export function Button({label}){return <button>{label}</button>} export {Button as default};`;
const refused = new Set([
	"later replacement",
	"equal named local function",
	"opaque mutation through passed object",
	"opaque mutation through global alias",
	"opaque getter after descriptor replacement",
	"unknown proxy refused without descriptor probes",
	"untracked return cannot borrow an unrelated helper receipt",
]);
interface Sample {
	name: string;
	loader: string;
	setup?: string;
	pick?: string;
	module?: string;
	exported?: string;
}
async function fixture(
	sample: Sample,
	consumed: boolean,
	authored?: { source: string; files?: Record<string, string> },
) {
	if (!browser) browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	// Each test keeps its build directory alive only until its daemon closes.
	const uiDir = join(makeTempDir(), "ui");
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const project = await serveProject({ uiDir });
	const source =
		authored?.source ??
		`import {lazy,Suspense} from 'react';import {Button} from 'shared/ui/other';${sample.setup ?? ""}
 globalThis.subscriptions=0;globalThis.subscriptionTrace=[];const promiseIds=new WeakMap();let nextPromiseId=0;const promiseId=promise=>{let id=promiseIds.get(promise);if(!id){id=++nextPromiseId;promiseIds.set(promise,id)}return id};const originalThen=Promise.prototype.then;Promise.prototype.then=function(...args){globalThis.subscriptions++;const receiver=promiseId(this);const result=Reflect.apply(originalThen,this,args);globalThis.subscriptionTrace.push([receiver,promiseId(result)]);return result};globalThis.other=Button;globalThis.reads=0;globalThis.traps={get:0,descriptor:0,ownKeys:0};globalThis.loads=0;globalThis.lazyInitializers=0;globalThis.choice=true;globalThis.pick=${JSON.stringify(sample.pick ?? "first")};
 const load=${sample.loader};const Pick=lazy(()=>{globalThis.loads++;return load()});const initialize=Pick._init;Pick._init=payload=>{globalThis.lazyInitializers++;return initialize(payload)};
 export default function Frame(){return <main style={{padding:40}}><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/><Pick label="Same"/></Suspense><input id="input" defaultValue="Kept"/></main>}`;
	writeFrame(project.root, "home", source);
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":700,"h":500}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	for (const path of [
		"shared/ui/leaf.tsx",
		"shared/ui/other.tsx",
		"shared/ui/runtime.tsx",
		"frames/home/parts/first.tsx",
		"frames/home/parts/second.tsx",
	])
		writeDesignFile(project.root, path, leaf);
	writeDesignFile(
		project.root,
		"shared/ui/barrel.ts",
		consumed
			? `export {Button as First,Button as Alias} from './leaf';export {Button as Second} from './other';`
			: `export {Button as First} from './leaf';export {Button as Second} from './other';import {Button} from './leaf';export const Alias=Button;`,
	);
	writeDesignFile(
		project.root,
		"shared/ui/thenable.ts",
		`import {Button} from './leaf';export {Button as default};let then;export {then};Object.defineProperty(globalThis,'install',{get(){return 0},set(){then=function(resolve){globalThis.reads++;delete this.then;this.default=Button;resolve(this)}}});`,
	);
	for (const [file, content] of Object.entries(authored?.files ?? {})) writeDesignFile(project.root, file, content);
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

	const normal = await browser.newPage({ viewport: { width: 700, height: 500 } });
	for (const surface of [page, normal])
		await surface.addInitScript(() => {
			const requests: { id: string; targetWidth: number; settleMs: number }[] = [];
			const results: { id: string; frame: string; error?: string }[] = [];
			Reflect.set(globalThis, "captureRequests", requests);
			Reflect.set(globalThis, "captureResults", results);
			addEventListener("message", (event) => {
				const message = event.data;
				if (message?.spool === "capture" && typeof message.id === "string")
					requests.push({ id: message.id, targetWidth: message.targetWidth, settleMs: message.settleMs });
				if (message?.spool === "capture-source" && typeof message.id === "string")
					results.push({
						id: message.id,
						frame: message.frame,
						...(message.error === undefined ? {} : { error: message.error }),
					});
			});
		});
	onTestFinished(async () => {
		await page.close();
		await normal.close();
	});
	// Ordinary React is a separate mount built from the original source bytes.
	const options = designBuildOptions({
		designDir: join(project.root, "design"),
		resolveDir: join(project.root, "design/frames/home"),
		sourcefile: "ordinary.tsx",
		contents: `import {createElement} from 'react';import {createRoot} from 'react-dom/client';import Frame from './frame';createRoot(document.getElementById('root')).render(createElement(Frame));`,
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
	// Ordinary React has the identical production document/capture controller,
	// but its bundle still excludes retained compilation and the source runtime.
	const ordinaryUrl = `${project.url}/ordinary-lazy-comparison`;
	await normal.route(ordinaryUrl, (route) =>
		route.fulfill({
			contentType: "text/html",
			body: assembleFrameDocument({
				project: project.name,
				frame: "home",
				projectCapability: "ordinary-comparison",
				controlOrigin: project.url,
				css: "",
				importMap: {},
				bootJs: ordinary.outputFiles!.find((f) => f.path.endsWith(".js"))!.text,
			}),
		}),
	);
	await normal.goto(ordinaryUrl);
	await normal.locator("button").first().waitFor();
	await page.goto(`${project.url}/p/${project.name}`);
	const frame = page.frameLocator('iframe[title="home"]');
	await frame.locator("button").first().waitFor({ timeout: 30000 });
	interface CaptureRequest {
		id: string;
		targetWidth: number;
		settleMs: number;
	}
	interface CaptureResult {
		id: string;
		frame: string;
		error?: string;
	}
	const requests = () =>
		frame.locator("main").evaluate(() => Reflect.get(globalThis, "captureRequests") as CaptureRequest[]);
	const mirrored = new Set<string>();
	const matchCaptures = async () => {
		for (const request of await requests()) {
			await expect
				.poll(async () =>
					(await page.evaluate(() => Reflect.get(globalThis, "captureResults") as CaptureResult[])).find(
						(result) => result.id === request.id,
					),
				)
				.toBeDefined();
			const result = (await page.evaluate(() => Reflect.get(globalThis, "captureResults") as CaptureResult[])).find(
				(result) => result.id === request.id,
			)!;
			expect(result.error).toBeUndefined();
			if (mirrored.has(request.id)) continue;
			await normal.evaluate(
				(request) => window.postMessage({ spool: "capture", ...request }, location.origin),
				request,
			);
			await expect
				.poll(async () =>
					(await normal.evaluate(() => Reflect.get(globalThis, "captureResults") as CaptureResult[])).find(
						(result) => result.id === request.id,
					),
				)
				.toBeDefined();
			const ordinaryResult = (
				await normal.evaluate(() => Reflect.get(globalThis, "captureResults") as CaptureResult[])
			).find((result) => result.id === request.id)!;
			expect(ordinaryResult.error).toBeUndefined();
			mirrored.add(request.id);
		}
	};
	const assertMatchedCaptures = async () => {
		const expected = [...mirrored];
		expect((await requests()).map((request) => request.id)).toEqual(expected);
		expect(
			(await page.evaluate(() => Reflect.get(globalThis, "captureResults") as CaptureResult[])).map(
				(result) => result.id,
			),
		).toEqual(expected);
		expect(
			(await normal.evaluate(() => Reflect.get(globalThis, "captureRequests") as CaptureRequest[])).map(
				(request) => request.id,
			),
		).toEqual(expected);
		expect(
			(await normal.evaluate(() => Reflect.get(globalThis, "captureResults") as CaptureResult[])).map(
				(result) => result.id,
			),
		).toEqual(expected);
	};
	// Establish the boundary with a real capture and mirror every observed request,
	// including background still captures. IDs and completions must match exactly.
	const capture = async () => {
		const id = crypto.randomUUID().replaceAll("-", "");
		await page.evaluate(
			(id) =>
				(document.querySelector('iframe[title="home"]') as HTMLIFrameElement).contentWindow!.postMessage(
					{ spool: "capture", id, targetWidth: 0, settleMs: 0 },
					"*",
				),
			id,
		);
		await expect.poll(async () => (await requests()).some((request) => request.id === id)).toBe(true);
		await matchCaptures();
		await assertMatchedCaptures();
	};
	await capture();
	const file = join(project.root, "design/frames/home/frame.tsx");
	const select = async () => {
		const box = await frame.locator("button").first().boundingBox();
		if (!box) throw new Error("missing button");
		await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
	};
	return { page, normal, frame, file, source, select, project, capture, assertMatchedCaptures };
}

it.each([
	...lazyChoices.map((sample) => ({ ...sample, consumed: false, capture: false })),
	...consumedChoices.map((sample) => ({ ...sample, consumed: true, capture: false })),
	...consumedChoices
		.filter((sample) =>
			["getter spread has application reads", "copied then export escapes during promise resolution"].includes(
				sample.name,
			),
		)
		.map((sample) => ({ ...sample, consumed: true, capture: true })),
])(
	"saves and inverses actual lazy origin: $name (capture interleaving=$capture)",
	{ timeout: 90000 },
	async (sample) => {
		const f = await fixture(sample, sample.consumed);
		const display = () =>
			f.frame.locator("main").evaluate(() => ({
				reads: Reflect.get(globalThis, "reads"),
				subscriptions: Reflect.get(globalThis, "subscriptions"),
				subscriptionTrace: Reflect.get(globalThis, "subscriptionTrace") as [number, number][],
				loads: Reflect.get(globalThis, "loads"),
				lazyInitializers: Reflect.get(globalThis, "lazyInitializers"),
				moduleInitializers: Reflect.get(globalThis, "moduleInitializers"),
				traps: Reflect.get(globalThis, "traps"),
			}));
		const ordinary = () =>
			f.normal.evaluate(() => ({
				reads: Reflect.get(globalThis, "reads"),
				subscriptions: Reflect.get(globalThis, "subscriptions"),
				subscriptionTrace: Reflect.get(globalThis, "subscriptionTrace") as [number, number][],
				loads: Reflect.get(globalThis, "loads"),
				lazyInitializers: Reflect.get(globalThis, "lazyInitializers"),
				moduleInitializers: Reflect.get(globalThis, "moduleInitializers"),
				traps: Reflect.get(globalThis, "traps"),
			}));
		await f.frame.locator("main").evaluate(() => Reflect.get(globalThis, "afterCommit")?.());
		await f.normal.evaluate(() => Reflect.get(globalThis, "afterCommit")?.());
		await f.assertMatchedCaptures();
		expect(await display()).toEqual(await ordinary());
		if (sample.capture) {
			const initial = await display();
			await f.capture();
			const captured = await display();
			expect(captured).toEqual(await ordinary());
			expect(captured.subscriptionTrace.slice(0, initial.subscriptionTrace.length)).toEqual(
				initial.subscriptionTrace,
			);
			expect(captured.subscriptionTrace.length).toBeGreaterThan(initial.subscriptionTrace.length);
			expect({
				...captured,
				subscriptions: initial.subscriptions,
				subscriptionTrace: initial.subscriptionTrace,
			}).toEqual(initial);
		}
		const before = await display();
		const commits = await f.frame.locator("main").evaluate(() => globalThis.__SPOOL_OBSERVER__.commits);
		const observations = await f.frame
			.locator("button")
			.evaluateAll((elements) => elements.map((element) => globalThis.__SPOOL_OBSERVER__.observe(element)));
		if (!sample.consumed || !refused.has(sample.name)) {
			const choices = observations.map((o) => o.chain.find((c) => c.lazyChoice)?.lazyChoice);
			expect(choices[0], JSON.stringify(observations)).toBeDefined();
			expect(choices[0]?.consumedRead?.id).not.toBe(choices[1]?.consumedRead?.id);
			if ("module" in sample && "exported" in sample)
				expect(choices[0]).toMatchObject({ module: sample.module, export: sample.exported });
			if (sample.name === "separate occurrences consume equal function slots") {
				expect(choices[0]).toMatchObject({ export: "First" });
				expect(choices[1]).toMatchObject({ export: "Alias" });
			}
			if (sample.consumed) {
				const expected: Record<string, string> = {
					"spread later accessor cannot overwrite default origin": "First",
					"separate occurrences consume equal function slots": "First",
					"getter default": "Button",
					"getter member on arbitrary object": "Button",
					"escaped alias replaces equal function": "Alias",
					"detached callback can change a consumed default": "Alias",
					"unknown call mutates result": "Alias",
					"descriptor installs getter": "Alias",
					"getter spread has application reads": "Alias",
					"same function getter log changes after commit": "First",
					"proxy spread retains ordinary traps": "First",
					"copied then export escapes during promise resolution": "Button",
					"proxy result descriptors": "Button",
				};
				expect(choices[0]?.export).toBe(expected[sample.name]);
				if (expected[sample.name] === "Button") expect(choices[0]?.module).toBe("shared/ui/leaf.tsx");
			}
		}
		await f.select();
		const field = f.page.getByRole("textbox", { name: "Text", exact: true });
		if (sample.consumed && refused.has(sample.name)) {
			const box = await f.frame.locator("button").first().boundingBox();
			if (!box) throw new Error("missing button");
			await f.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
			expect(await f.frame.locator("button").first().getAttribute("contenteditable")).toBeNull();
			expect(readFileSync(f.file, "utf8")).toBe(f.source);
			expect(observations[0]?.refusal).toBeTruthy();
			return;
		}
		await expect.poll(() => field.count()).toBe(1);
		await f.assertMatchedCaptures();
		expect(await display()).toEqual(before);
		expect(await f.frame.locator("main").evaluate(() => globalThis.__SPOOL_OBSERVER__.commits)).toBe(commits);
		const delivery = f.page.waitForResponse(
			(response) =>
				response.url().endsWith("/source") &&
				response.request().postData()?.includes('"action":"delivered"') === true,
		);
		await field.fill("Saved origin");
		await field.press("Tab");
		await expect.poll(() => readFileSync(f.file, "utf8")).toContain('label="Saved origin"');
		await expect.poll(() => f.frame.locator("button").first().textContent()).toBe("Saved origin");
		expect(await f.frame.locator("button").nth(1).textContent()).toBe("Same");
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		await delivery;
		await f.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

		await f.page.mouse.click(500, 750);
		await f.page.keyboard.press("ControlOrMeta+z");
		await expect.poll(() => readFileSync(f.file, "utf8")).toBe(f.source);
		await expect.poll(() => f.frame.locator("button").first().textContent()).toBe("Same");
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		await f.page.keyboard.press("ControlOrMeta+Shift+z");
		await expect.poll(() => f.frame.locator("button").first().textContent()).toBe("Saved origin");
	},
);

async function choice(f: Awaited<ReturnType<typeof fixture>>) {
	return f.frame
		.locator("button")
		.first()
		.evaluate(
			(element) =>
				globalThis.__SPOOL_OBSERVER__.observe(element).chain.find((entry) => entry.lazyChoice)?.lazyChoice,
		);
}
async function action(f: Awaited<ReturnType<typeof fixture>>, expression: string) {
	await f.normal.evaluate(expression);
	const mounted = f.page.frames().find((frame) => frame.url().includes("/frames/home"));
	if (!mounted) throw new Error("missing served frame");
	await mounted.evaluate(expression);
	for (const surface of [f.page, f.normal])
		await surface.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
}
async function saveAndInverse(f: Awaited<ReturnType<typeof fixture>>, text = "Saved lifecycle") {
	await f.select();
	const field = f.page.getByRole("textbox", { name: "Text", exact: true });
	await expect.poll(() => field.count()).toBe(1);
	const delivered = () =>
		f.page.waitForResponse(
			(response) =>
				response.url().endsWith("/source") &&
				response.request().postData()?.includes('"action":"delivered"') === true,
		);
	const save = delivered();
	await field.fill(text);
	await field.press("Tab");
	await save;
	await expect.poll(() => f.frame.locator("button").first().textContent()).toBe(text);
	await f.page.mouse.click(500, 750);
	const undo = delivered();
	await f.page.keyboard.press("ControlOrMeta+z");
	await undo;
	await expect.poll(() => readFileSync(f.file, "utf8")).toBe(f.source);
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
	const redo = delivered();
	await f.page.keyboard.press("ControlOrMeta+Shift+z");
	await redo;
	await expect.poll(() => f.frame.locator("button").first().textContent()).toBe(text);
}

it("retains the consumed receipt through later writes and ordinary reuse, then consumes an authored keyed remount", {
	timeout: 90000,
}, async () => {
	const f = await fixture({ name: "reuse", loader: "" }, true, {
		source: `import {lazy,Suspense,useState} from 'react';let replace;const Pick=lazy(async()=>{const m=await import('shared/ui/barrel');const result={default:m.First};replace=()=>Promise.resolve().then(()=>{result.default=m.Alias});return result});export default function Frame(){const [n,setN]=useState(0);globalThis.replace=()=>replace();globalThis.next=()=>setN(n+1);return <main style={{padding:40}}><Suspense fallback={<i>Waiting</i>}><Pick key={Math.floor(n/2)} label="Same"/><Pick label="Same"/></Suspense><input id="input" defaultValue="Kept"/><span>{n}</span></main>}`,
	});
	const first = await choice(f);
	expect(first).toMatchObject({ export: "First" });
	await action(f, "replace()");
	expect(await choice(f)).toEqual(first);
	await action(f, "next()");
	expect(await choice(f)).toEqual(first);
	await action(f, "next()");
	const remount = await choice(f);
	expect(remount).toMatchObject({ export: "Alias" });
	expect(remount?.consumedRead?.id).not.toBe(first?.consumedRead?.id);
	expect(await f.frame.locator("button").allTextContents()).toEqual(
		await f.normal.locator("button").allTextContents(),
	);
	await saveAndInverse(f);
});

it.each([false, true])(
	"discards abandoned lazy work, including an already-consumed suspended read: %s",
	{ timeout: 90000 },
	async (consumed) => {
		const f = await fixture({ name: "abandoned", loader: "" }, true, {
			source: `import {lazy,Suspense,startTransition,useState} from 'react';globalThis.reads=0;globalThis.block=true;globalThis.slot=false;let finish;globalThis.renderGate=new Promise(r=>finish=r);globalThis.finish=()=>{globalThis.block=false;finish()};const Pick=lazy(async()=>{const m=await import('shared/ui/barrel');${consumed ? "" : "await globalThis.renderGate;"}return {get default(){globalThis.reads++;return globalThis.slot?m.Alias:m.First}}});export default function Frame(){const [next,setNext]=useState(false);globalThis.next=()=>startTransition(()=>setNext(true));globalThis.abandon=()=>setNext(false);return <main style={{padding:40}}><Suspense fallback={<i>Waiting</i>}>{next?<Pick label="Candidate"/>:<button>Committed</button>}</Suspense><input id="input" defaultValue="Kept"/></main>}`,
			files: {
				"shared/ui/leaf.tsx": `export function Button({label}){if(globalThis.block)throw globalThis.renderGate;return <button>{label}</button>}`,
			},
		});
		const original = await f.frame
			.locator("button")
			.evaluate((element) => globalThis.__SPOOL_OBSERVER__.observe(element));
		await action(f, "next()");
		if (consumed)
			await expect
				.poll(() => f.frame.locator("main").evaluate(() => Reflect.get(globalThis, "reads")))
				.toBeGreaterThan(0);
		expect(await f.frame.locator("button").allTextContents()).toEqual(["Committed"]);
		expect(
			await f.frame
				.locator("button")
				.evaluate((element) => globalThis.__SPOOL_OBSERVER__.observe(element).occurrence),
		).toBe(original.occurrence);
		await action(f, "abandon()");
		await action(f, "globalThis.slot=true;finish()");
		expect(await f.frame.locator("button").allTextContents()).toEqual(["Committed"]);
		await action(f, "next()");
		await expect.poll(() => f.frame.locator("button").textContent()).toBe("Candidate");
		expect(await choice(f)).toMatchObject({ export: "Alias" });
		expect(await f.frame.locator("button").allTextContents()).toEqual(
			await f.normal.locator("button").allTextContents(),
		);
		await saveAndInverse(f);
	},
);

it("keeps a separately imported lazy loader and cyclic namespace exports through source save and inverse", {
	timeout: 90000,
}, async () => {
	const f = await fixture({ name: "cycle", loader: "" }, true, {
		source: `import {Suspense} from 'react';import {Pick} from 'shared/ui/deferred';export default function Frame(){return <main style={{padding:40}}><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/><Pick label="Same"/></Suspense></main>}`,
		files: {
			"shared/ui/cycle.ts": `export * from './barrel';`,
			"shared/ui/barrel.ts": `export * from './cycle';export * from './leaf';`,
			"shared/ui/deferred.ts": `import {lazy as deferred} from 'react';export const Pick=deferred(()=>import('./barrel').then(m=>{const result={get default(){return m.Button}};return {...result}}));`,
		},
	});
	expect(await choice(f)).toMatchObject({
		module: "shared/ui/barrel.ts",
		export: "Button",
		loader: { file: "shared/ui/deferred.ts" },
	});
	await saveAndInverse(f);
});

it("matches ordinary lazy state, refs, props, input, focus and getter counts without granting computed text", {
	timeout: 90000,
}, async () => {
	const f = await fixture(
		{
			name: "state parity",
			loader: `()=>import('shared/ui/leaf').then(m=>({get default(){globalThis.reads++;return m.Button}}))`,
		},
		true,
		{
			source: `import {lazy,Suspense} from 'react';globalThis.reads=0;globalThis.initializers=0;globalThis.refs=0;const Pick=lazy(()=>import('shared/ui/leaf').then(m=>({get default(){globalThis.reads++;return m.Button}})));export default function Frame(){return <main style={{padding:40}}><Suspense fallback={<i>Wait</i>}><Pick label="Same"/></Suspense><input id="input" defaultValue="Kept"/></main>}`,
			files: {
				"shared/ui/leaf.tsx": `import {useState,useRef,useEffect} from 'react';export function Button(props){const [count,setCount]=useState(()=>{globalThis.initializers++;return 0});const ref=useRef(null);useEffect(()=>{globalThis.refs++;},[]);globalThis.propsSeen=props.label;return <button ref={ref} data-count={count} onClick={()=>setCount(n=>n+1)}>{props.label}:{count}</button>}`,
			},
		},
	);
	const box = await f.frame.locator("button").boundingBox();
	if (!box) throw new Error("no button");
	await f.page.mouse.click(box.x + 5, box.y + 5);
	await f.page.keyboard.press("Enter");
	await f.frame.locator("button").click();
	await f.frame.locator("input").fill("Typed");
	await f.frame.locator("input").press("ArrowLeft");
	await f.normal.locator("button").click();
	await f.normal.locator("input").fill("Typed");
	await f.normal.locator("input").press("ArrowLeft");
	const snapshot = () => ({
		initializers: Reflect.get(globalThis, "initializers"),
		reads: Reflect.get(globalThis, "reads"),
		refs: Reflect.get(globalThis, "refs"),
		props: Reflect.get(globalThis, "propsSeen"),
		focus: document.activeElement?.id,
		text: document.querySelector("button")?.textContent,
		input: document.querySelector("input")?.value,
		caret: document.querySelector("input")?.selectionStart,
	});
	const before = await f.frame.locator("main").evaluate(snapshot);
	expect(before).toEqual(await f.normal.evaluate(snapshot));
	expect(before).toMatchObject({
		initializers: 1,
		refs: 1,
		props: "Same",
		focus: "input",
		input: "Typed",
		caret: 4,
		text: "Same:1",
	});
	await f.frame.locator("button").evaluate((element) => globalThis.__SPOOL_OBSERVER__.observe(element));
	expect(await f.frame.locator("main").evaluate(snapshot)).toEqual(before);
	await f.page.bringToFront();
	await f.page.keyboard.press("Escape");
	await expect
		.poll(() => f.page.locator('iframe[title="home"]').evaluate((element) => getComputedStyle(element).pointerEvents))
		.toBe("none");
	await f.page.mouse.click(500, 750);
	await f.page.getByRole("button", { name: "edit", exact: true }).click();
	const picking = await f.frame.locator("button").boundingBox();
	if (!picking) throw new Error("missing button");
	await f.page.mouse.click(picking.x + 5, picking.y + 5);
	const selected = await f.frame.locator("button").boundingBox();
	if (!selected) throw new Error("missing button");
	await f.page.mouse.click(selected.x + 5, selected.y + 5);
	await expect
		.poll(() => f.page.locator('[data-hand-refusal="source"]').textContent())
		.toBe("these words have no editable local literal source");
	expect(await f.frame.locator("button").getAttribute("contenteditable")).toBeNull();
	expect(readFileSync(f.file, "utf8")).toBe(f.source);
});

it("refuses an uncaptured runtime module even when it returns an observed local component", {
	timeout: 90000,
}, async () => {
	const f = await fixture({ name: "outside", loader: "" }, true, {
		source: `import {lazy,Suspense} from 'react';function Button({label}){return <button>{label}</button>}globalThis.ExternalButton=Button;globalThis.moduleUrl='data:text/javascript,export default globalThis.ExternalButton';const Pick=lazy(async()=>{const m=await import(globalThis.moduleUrl);return {get default(){return m.default}}});export default function Frame(){return <main style={{padding:40}}><Suspense fallback={<i>Wait</i>}><Pick label="Same"/></Suspense></main>}`,
	});
	expect(await f.frame.locator("button").textContent()).toBe(await f.normal.locator("button").textContent());
	const observed = await f.frame
		.locator("button")
		.evaluate((element) => globalThis.__SPOOL_OBSERVER__.observe(element));
	expect(observed.refusal).toBe("consumed lazy read has no admitted executed export origin");
	await f.select();
	const box = await f.frame.locator("button").boundingBox();
	if (!box) throw new Error("no button");
	await f.page.mouse.click(box.x + 5, box.y + 5);
	expect(await f.frame.locator("button").getAttribute("contenteditable")).toBeNull();
	expect(readFileSync(f.file, "utf8")).toBe(f.source);
});

it("preserves every shadowed import binding and refuses spelling-based consumed origins", {
	timeout: 90000,
}, async () => {
	const f = await fixture({ name: "shadow", loader: "" }, true, {
		source: `import {lazy,Suspense} from 'react';import {Button} from 'shared/ui/other';import {choose,result,results} from 'shared/ui/choose';globalThis.shadowResults=results;const Pick=lazy(async()=>result(choose(Button)));export default function Frame(){return <main style={{padding:40}}><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>}`,
		files: {
			"shared/ui/choose.ts": `import {Button as First} from './leaf';const __consumedImport0='occupied';export function choose(First){return First}function nested(){function callback(First){return First}return callback('parameter')}function local(){const First='local';return First}function block(){if(true){let First='block';return First}}function destructured({First}){return First}function caught(){try{throw 'catch'}catch(First){return First}}function callback(){return ['callback'].map(First=>{return First})[0]}function hoisted(){First='var';return First;var First}function named(){return typeof(function First(){return First})()}export const results=[nested(),local(),block(),destructured({First:'destructured'}),caught(),callback(),hoisted(),named(),__consumedImport0];export function result(First){return {get default(){return First}}}`,
		},
	});
	const actual = await f.frame.locator("main").evaluate(() => Reflect.get(globalThis, "shadowResults"));
	expect(actual).toEqual([
		"parameter",
		"local",
		"block",
		"destructured",
		"catch",
		"callback",
		"var",
		"function",
		"occupied",
	]);
	expect(actual).toEqual(await f.normal.evaluate(() => Reflect.get(globalThis, "shadowResults")));
	expect(await f.frame.locator("button").textContent()).toBe(await f.normal.locator("button").textContent());
	expect(
		await f.frame.locator("button").evaluate((element) => globalThis.__SPOOL_OBSERVER__.observe(element).refusal),
	).toBe("consumed lazy read has no admitted executed export origin");
	await f.select();
	const box = await f.frame.locator("button").boundingBox();
	if (!box) throw new Error("missing button");
	await f.page.mouse.click(box.x + 5, box.y + 5);
	expect(await f.frame.locator("button").getAttribute("contenteditable")).toBeNull();
	expect(readFileSync(f.file, "utf8")).toBe(f.source);
});

it("saves and inverses an unshadowed imported getter result", { timeout: 90000 }, async () => {
	const f = await fixture(
		{
			name: "unshadowed",
			setup: `import {Button as Chosen} from 'shared/ui/runtime';`,
			loader: `async()=>({get default(){return Chosen}})`,
		},
		true,
	);
	expect(await choice(f)).toMatchObject({ module: "shared/ui/runtime.tsx", export: "Button" });
	await saveAndInverse(f);
});

it.each(["loader", "caller", "module", "absent-path", "generation", "directory"])(
	"retires the original lazy source read when its %s changes",
	{ timeout: 90000 },
	async (cause) => {
		const f = await fixture(
			{
				name: "retirement",
				loader:
					cause === "directory"
						? `()=>import('./parts/'+globalThis.pick+'.tsx')`
						: `()=>globalThis.choice?import('shared/ui/barrel').then(m=>({default:m.First})):import('shared/ui/other')`,
			},
			true,
		);
		await f.select();
		const field = f.page.getByRole("textbox", { name: "Text", exact: true });
		await expect.poll(() => field.count()).toBe(1);
		const response = f.page.waitForResponse(
			(response) =>
				response.url().endsWith("/source") && response.request().postData()?.includes('"action":"read"') === true,
		);
		await field.focus();
		const asked = (await (await response).json()) as { ok: boolean; read: SourceRead; reason?: string };
		expect(asked.ok, asked.reason).toBe(true);
		const read = asked.read;
		if (cause === "loader")
			writeFileSync(f.file, f.source.replace("()=>globalThis.choice?", "()=>!globalThis.choice?"));
		if (cause === "caller") writeFileSync(f.file, f.source.replace('label="Same"', 'label="Outside"'));
		if (cause === "module")
			writeDesignFile(
				f.project.root,
				"shared/ui/barrel.ts",
				`export {Button as First,Button as Alias} from './other';`,
			);
		if (cause === "absent-path")
			writeDesignFile(
				f.project.root,
				"shared/ui/barrel.tsx",
				`export {Button as First,Button as Alias} from './leaf';`,
			);
		if (cause === "directory") writeDesignFile(f.project.root, "frames/home/parts/third.tsx", leaf);
		const before = readFileSync(f.file, "utf8");
		const result = await fetch(`${f.project.url}/api/p/${f.project.name}/source`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Spool-Control": f.project.controlToken },
			body: JSON.stringify({
				action: "commit",
				handle: read.handle,
				generation: read.generation + (cause === "generation" ? 1 : 0),
				original: read.original,
				source: read.source,
				text: "Must refuse",
			}),
		});
		expect(await result.json()).toMatchObject({ ok: false });
		expect(readFileSync(f.file, "utf8")).toBe(before);
	},
);

it("refuses a lazy text inverse when a captured empty glob directory gains another choice", {
	timeout: 90000,
}, async () => {
	const f = await fixture({ name: "glob inverse", loader: "" }, true, {
		source: `import {lazy,Suspense} from 'react';globalThis.pick='first';const Pick=lazy(()=>import('./parts/'+globalThis.pick+'.tsx'));export default function Frame(){return <main style={{padding:40}}><Suspense fallback={<i>Waiting</i>}><Pick label="Same"/></Suspense></main>}`,
		files: { "frames/home/parts/empty/.keep": "" },
	});
	await saveAndInverse(f);
	const saved = readFileSync(f.file, "utf8");
	writeDesignFile(f.project.root, "frames/home/parts/empty/third.tsx", leaf);
	await f.page.mouse.click(500, 750);
	const response = f.page.waitForResponse(
		(response) =>
			response.url().endsWith("/source") && response.request().postData()?.includes('"action":"inverse"') === true,
	);
	await f.page.keyboard.press("ControlOrMeta+z");
	expect(await (await response).json()).toMatchObject({ ok: false });
	expect(readFileSync(f.file, "utf8")).toBe(saved);
});
