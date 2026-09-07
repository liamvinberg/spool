import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium, type Page } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import type { SourceRead } from "../source-edit";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const primitive = `import {useState,useEffect} from 'react';function Child({label}){const[n,set]=useState(0);useEffect(()=>set(0),[label]);return <section><span id="label">{label}</span><button onClick={()=>set(n+1)}>Count</button><output>{n}</output><input defaultValue="Native"/></section>}export function Button(){return <Child label="Before"/>}`;
const slot = (reset: boolean) =>
	`import {useState,useEffect} from 'react';function Child({content}){const[n,set]=useState(0);useEffect(()=>{${reset ? "set(0)" : ""}},[content.props.children]);return <section>{content}<button onClick={()=>set(n+1)}>Count</button><output>{n}</output><input defaultValue="Native"/></section>}export function Button(){return <Child content={<span id="label">Before</span>}/>}`;
const suspense = `import {Suspense} from 'react';let ready=false;let resolve;const gate=new Promise(r=>resolve=r);globalThis.finish=()=>{ready=true;resolve()};function Child({content}){if(content.props.children==='After'&&!ready)throw gate;return content}function Holder({content}){return <Suspense fallback={<i>Waiting</i>}><Child content={content}/></Suspense>}export function Button(){return <Holder content={<span id="label">Before</span>}/>}`;
const positives = [
	{ name: "primitive", source: primitive, reset: true },
	{ name: "slot-reset", source: slot(true), reset: true },
	{ name: "slot-retain", source: slot(false), reset: false },
	{ name: "suspense", source: suspense, reset: false },
];
const refusals: Record<string, string> = {
	"primitive-write": primitive.replace("const[n,set]", "label=label;const[n,set]"),
	"primitive-alias": primitive
		.replace("const[n,set]", "const alias=label;const[n,set]")
		.replace("{label}</span>", "{alias}</span>"),
	"primitive-shadow": primitive.replace("const[n,set]", "const hidden=(label)=>label;const[n,set]"),
	"primitive-eval": primitive.replace("const[n,set]", "eval('');const[n,set]"),
	"primitive-hook-shadow": primitive
		.replace("function Child({label})", "function Child({label,useEffect})")
		.replace('<Child label="Before"/>', '<Child label="Before" useEffect={()=>{}}/>'),
	"slot-reassign": slot(false).replace("const[n,set]", "content=content;const[n,set]"),
	"slot-field-write": slot(false).replace("const[n,set]", "if(false)content.props.children='Changed';const[n,set]"),
	"slot-shadow": slot(false).replace("const[n,set]", "const hidden=(content)=>content;const[n,set]"),
	"slot-alias": slot(false).replace("const[n,set]", "const alias=content;const[n,set]"),
	"slot-dynamic-alias": slot(false)
		.replace("const[n,set]", "const alias=globalThis.flag?content:content;const[n,set]")
		.replace("{content}<button", "{alias}<button"),
	"slot-escape": slot(false).replace("const[n,set]", "globalThis.escaped=content;const[n,set]"),
	"slot-opaque-call": slot(false)
		.replace("function Child", "function opaque(value){return value}function Child")
		.replace("const[n,set]", "opaque(content);const[n,set]"),
	"slot-opaque-component": slot(false)
		.replace("function Child", "function Opaque({value}){return null}function Child")
		.replace("{content}<button", "{content}{true?<Opaque value={content}/>:null}<button"),
	"slot-forward-alias": suspense
		.replace("function Holder({content}){return", "function Holder({content}){const alias=content;return")
		.replace("<Child content={content}/>", "<Child content={alias}/>"),
};

async function served(source: string, shared = false) {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeDesignFile(project.root, "shared/flow.tsx", source);
	const frameSource = `import {Button} from "shared/flow";export default function Frame(){return <main style={{padding:40}}><Button/><h2 id="unrelated">Before</h2><input id="draft" defaultValue="Independent"/></main>}`;
	writeFrame(project.root, "home", frameSource);
	if (shared) {
		writeFrame(project.root, "second", frameSource);
		writeDesignFile(project.root, "frames/second/frame.json", '{"x":740,"y":0,"w":450,"h":500}');
	}
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":700,"h":500}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const writes: string[] = [];
	page.on("request", (request) => {
		if (request.url().endsWith("/source")) {
			const action: unknown = request.postDataJSON()?.action;
			if (action === "commit" || action === "inverse") writes.push(action);
		}
	});
	await page.addInitScript(() => {
		const deliveries: unknown[] = [];
		Reflect.set(window, "sourceFlowDeliveries", deliveries);
		addEventListener("message", (event) => {
			const message = event.data;
			if (message?.spool === "source-reply" && message.result?.installation) deliveries.push(message.result);
		});
	});
	await page.goto(`${project.url}/p/${project.name}`);
	const frame = page.frameLocator('iframe[title="home"]');
	const label = frame.locator("#label");
	await expect.poll(() => label.count(), { timeout: 30_000 }).toBe(1);
	const file = join(project.root, "design/shared/flow.tsx");
	const select = async () => {
		const box = await label.boundingBox();
		if (!box) throw new Error("label has no box");
		await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
		await page.mouse.click(box.x + 10, box.y + box.height / 2);
		await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
		await expect
			.poll(async () => {
				const response = await fetch(`${project.url}/api/p/${project.name}/selection`, {
					headers: { "X-Spool-Control": project.controlToken },
				});
				const body = (await response.json()) as { selection?: { selector?: string }[] };
				return body.selection?.[0]?.selector;
			})
			.toBe("#label");
		return box;
	};
	return {
		page,
		frame,
		label,
		file,
		browser,
		select,
		writes,
		frameFile: join(project.root, "design/frames/home/frame.tsx"),
		frameSource,
	};
}

// Ordinary React is only the comparison oracle. These pure fixture entry functions
// expose the original child type and the props authored before/after a source edit.
async function ordinary(browser: Browser, before: string, after: string) {
	const bundle = await build({
		stdin: {
			contents: `import {createRoot} from 'react-dom/client';import {createElement} from 'react';import {flushSync} from 'react-dom';import {Button as Before} from 'before';import {Button as After} from 'after';const old=Before();const next=After();const root=createRoot(document.getElementById('root'));const render=(props)=>flushSync(()=>root.render(createElement('main',null,createElement(old.type,props),createElement('input',{id:'draft',defaultValue:'Independent'}))));render(old.props);globalThis.oracleSelect=after=>render(after?next.props:old.props);`,
			resolveDir: process.cwd(),
			loader: "js",
		},
		bundle: true,
		write: false,
		format: "iife",
		jsx: "automatic",
		plugins: [
			{
				name: "authored-fixture",
				setup(bundler) {
					bundler.onResolve({ filter: /^(before|after)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
					bundler.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
						contents:
							args.path === "before" ? before.replace("globalThis.finish=", "globalThis.oracleFinish=") : after,
						loader: "tsx",
						resolveDir: process.cwd(),
					}));
				},
			},
		],
	});
	const page = await browser.newPage();
	await page.setContent('<div id="root"></div>');
	await page.addScriptTag({ content: bundle.outputFiles[0]?.text ?? "" });
	return page;
}
async function focusDraft(page: Page) {
	await page.locator("#draft").evaluate((el) => {
		if (!(el instanceof HTMLInputElement)) throw new Error("no input");
		el.value = "Kept independent";
		el.focus();
		el.setSelectionRange(2, 4);
	});
}

it.each(positives)(
	"source flow $name saves and reverses with ordinary React parity",
	{ timeout: 120_000 },
	async ({ name, source, reset }) => {
		const f = await served(source, true);
		const second = f.page.frameLocator('iframe[title="second"]');
		await expect.poll(() => second.locator("#label").count()).toBe(1);
		await second.locator("#draft").fill("Kept second");
		const oracle = await ordinary(
			f.browser,
			source,
			source.replace('"Before"', '"After"').replace(">Before<", ">After<"),
		);
		if (name !== "suspense") {
			// DOM click invokes the authored handler while the canvas remains in selection mode.
			await f.frame.locator("button").evaluate((el) => (el as HTMLButtonElement).click());
			await oracle.locator("button").click();
			await f.frame.locator("section input").fill("Kept child");
			await oracle.locator("section input").fill("Kept child");
			await expect.poll(() => f.frame.locator("output").textContent()).toBe("1");
		}
		await f.frame.locator("#draft").evaluate((el) => Reflect.set(window, "originalInput", el));
		const commits = await f.label.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits);
		const box = await f.select();
		const originalResponse = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
		);
		await f.page.mouse.click(box.x + 10, box.y + box.height / 2);
		const response = await originalResponse;
		const result = (await response.json()) as { ok: boolean; read?: SourceRead; reason?: string };
		expect(result.ok, result.reason).toBe(true);
		if (!result.read) throw new Error("missing original source read");
		const original = result.read;
		const frozen = JSON.stringify(original);
		expect(original.value).toBe("Before");
		expect(original.scope).toBe(name === "primitive" ? "call-site" : "definition");
		expect(original.source).toMatch(/^shared\/flow\.tsx:1:\d+$/);
		expect(original.original.occurrence).not.toBe("");
		expect(original.original.context).not.toBe("");
		expect(original.role).toBe(name === "primitive" ? "literal-attribute" : "literal-child");
		expect(original.field).toBe(name === "primitive" ? "label" : undefined);
		expect(await f.label.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits)).toBe(commits);
		await expect.poll(() => f.label.getAttribute("contenteditable")).toBe("plaintext-only");
		// Allow the genuine source response through only after the independent native
		// input has focus, so delivery and both inverses must preserve its node and caret.
		await f.page.route("**/source", async (route) => {
			const action: unknown = route.request().postDataJSON()?.action;
			if (action !== "commit" && action !== "inverse") return route.continue();
			const response = await route.fetch();

			await f.frame.locator("#draft").evaluate((el) => {
				if (!(el instanceof HTMLInputElement)) throw new Error("no input");
				el.value = "Kept independent";
				el.focus();
				el.setSelectionRange(2, 4);
			});
			await route.fulfill({ response });
		});
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("After");
		expect(readFileSync(f.file, "utf8")).toBe(source);
		expect(await f.frame.locator("#unrelated").textContent()).toBe("Before");
		await f.page.keyboard.press("Enter");
		for (let phase = 0; phase < 3; phase++) {
			const text = phase === 1 ? "Before" : "After";
			if (phase > 0) {
				await f.page.mouse.click(800, 700);
				await f.page.keyboard.press(phase === 1 ? "ControlOrMeta+z" : "ControlOrMeta+Shift+z");
			}
			await focusDraft(oracle);
			await oracle.evaluate((after) => Reflect.get(globalThis, "oracleSelect")(after), phase !== 1);
			if (name === "suspense" && phase === 0) {
				await expect.poll(() => f.frame.locator("i").textContent()).toBe("Waiting");
				await expect.poll(() => oracle.locator("i").textContent()).toBe("Waiting");
				await expect.poll(() => second.locator("i").textContent()).toBe("Waiting");
				await f.frame.locator("i").evaluate(() => Reflect.get(globalThis, "finish")());
				await second.locator("i").evaluate(() => Reflect.get(globalThis, "finish")());
				await oracle.evaluate(() => Reflect.get(globalThis, "oracleFinish")());
			}
			await expect.poll(() => f.label.textContent()).toBe(text);
			await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
			expect(await oracle.locator("#label").textContent()).toBe(text);
			await expect.poll(() => second.locator("#label").textContent()).toBe(text);
			expect(await second.locator("#draft").inputValue(), `phase ${phase}`).toBe("Kept second");
			expect(await second.locator("#unrelated").textContent()).toBe("Before");
			expect(await f.label.getAttribute("contenteditable")).toBe(null);
			const deliveries = (await f.page.evaluate(() => Reflect.get(window, "sourceFlowDeliveries"))) as {
				installation: string;
				rendered: string;
			}[];
			expect(deliveries).toHaveLength((phase + 1) * 2);
			expect(deliveries.every((value) => value.installation === "installed")).toBe(true);
			if (name !== "suspense") expect(deliveries.every((value) => value.rendered === "verified")).toBe(true);
			expect(readFileSync(f.file, "utf8")).toBe(
				phase === 1 ? source : source.replace('"Before"', '"After"').replace(">Before<", ">After<"),
			);
			expect(readFileSync(f.frameFile, "utf8")).toBe(f.frameSource);
			expect(await f.frame.locator("#unrelated").textContent()).toBe("Before");
			if (name !== "suspense") {
				await expect.poll(() => f.frame.locator("output").textContent()).toBe(reset ? "0" : "1");
				expect(await oracle.locator("output").textContent()).toBe(reset ? "0" : "1");
				expect(await f.frame.locator("section input").inputValue()).toBe(
					await oracle.locator("section input").inputValue(),
				);
			}
			const native = await f.frame.locator("#draft").evaluate((el) => ({
				same: el === Reflect.get(window, "originalInput"),
				focused: el === document.activeElement,
				start: (el as HTMLInputElement).selectionStart,
				end: (el as HTMLInputElement).selectionEnd,
				value: (el as HTMLInputElement).value,
			}));
			expect(native).toEqual({ same: true, focused: true, start: 2, end: 4, value: "Kept independent" });
			expect(JSON.stringify(original)).toBe(frozen);
		}
		expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
	},
);

it.each(Object.entries(refusals))(
	"source flow refuses %s before any source write",
	{ timeout: 120_000 },
	async (_name, source) => {
		const f = await served(source);
		const commits = await f.label.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits);
		const box = await f.select();
		await f.page.mouse.click(box.x + 10, box.y + box.height / 2);
		await expect.poll(() => f.page.locator('[data-hand-notice="blocked"], [data-hand-refusal]').count()).toBe(1);
		expect(await f.label.getAttribute("contenteditable")).toBe(null);
		expect(readFileSync(f.file, "utf8")).toBe(source);
		expect(readFileSync(f.frameFile, "utf8")).toBe(f.frameSource);
		expect(f.writes).toEqual([]);
		expect(await f.label.evaluate(() => globalThis.__SPOOL_OBSERVER__.commits)).toBe(commits);
	},
);
