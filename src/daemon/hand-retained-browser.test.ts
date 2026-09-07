import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import type { SourcePublication, UseOutcome } from "../source-edit";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const APP = `import {useEffect,useMemo,useState} from "react";
export default function Frame(){
 const [count,setCount]=useState(0);
 const label=<h1 id="label" style={{margin:0,fontSize:30}}>Hello world</h1>;
 useEffect(()=>{window.mounts=(window.mounts||0)+1;window.input=document.getElementById("draft")},[]);
 return <main style={{padding:40}}>{label}<button id="count" onClick={()=>setCount(n=>n+1)}>{count}</button><input id="draft" defaultValue="initial"/><div id="scroll" style={{height:100,overflow:"auto"}}><div style={{height:500}}>scroll content</div></div></main>
}`;

async function served(source = APP) {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "home", source);
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
	await page.goto(`${project.url}/p/${project.name}`);
	const frame = page.frameLocator('iframe[title="home"]');
	await expect.poll(() => frame.locator("#label").count(), { timeout: 30_000 }).toBe(1);
	const file = join(project.root, "design/frames/home/frame.tsx");
	const select = async () => {
		await expect.poll(() => page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		const box = await frame.locator("#label").boundingBox();
		if (!box) throw new Error("label has no native box");
		await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
		await page.mouse.click(box.x + 40, box.y + box.height / 2);
		await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
		await expect
			.poll(
				async () => {
					const response = await fetch(`${project.url}/api/p/${project.name}/selection`, {
						headers: { "X-Spool-Control": project.controlToken },
					});
					const body = (await response.json()) as { selection?: { selector?: string }[] };
					return body.selection?.[0]?.selector;
				},
				{ timeout: 15_000 },
			)
			.toBe("#label");
		return box;
	};
	const edit = async () => {
		const box = await select();
		await page.mouse.click(box.x + 40, box.y + box.height / 2);
		await expect.poll(() => frame.locator("#label").getAttribute("contenteditable")).toBe("plaintext-only");
	};
	return { page, frame, file, select, edit };
}
async function replace(page: Page, text: string): Promise<void> {
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.insertText(text);
}

it("saves native and Properties text without resetting source-unrelated state, and uses retained undo and redo", {
	timeout: 120_000,
}, async () => {
	const f = await served();
	const label = f.frame.locator("#label");
	// Ordinary entered interaction first gives the application real state to retain.
	const box = await label.boundingBox();
	if (!box) throw new Error("no label");
	await f.page.mouse.click(box.x + 20, box.y + 10);
	await f.page.keyboard.press("Enter");
	await f.frame.locator("#count").click();
	await f.frame.locator("#draft").fill("my unsaved form input");
	await f.frame.locator("#draft").press("ArrowLeft");
	await f.frame.locator("#scroll").evaluate((el) => {
		el.scrollTop = 90;
	});
	await f.page.keyboard.press("Escape");
	await expect
		.poll(() => f.page.locator('iframe[title="home"]').evaluate((el) => getComputedStyle(el).pointerEvents))
		.toBe("none");
	await f.edit();
	// Once open, double click belongs to native word selection.
	await label.dblclick({ position: { x: 25, y: 15 } });
	expect(await label.evaluate(() => getSelection()?.toString())).toBe("Hello");
	await replace(f.page, "Saved & {literal}");
	await label.evaluate((el) => {
		const target = window as unknown as { samples: string[]; sampling: boolean };
		target.samples = [];
		target.sampling = true;
		const sample = () => {
			target.samples.push(el.textContent ?? "");
			if (target.sampling) requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	});
	await f.page.keyboard.press("Enter");
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain("Saved &amp; &#123;literal&#125;");
	await expect.poll(() => label.textContent()).toBe("Saved & {literal}");
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
	const retained = await label.evaluate(() => {
		const target = window as unknown as { mounts: number; input: HTMLElement; samples: string[]; sampling: boolean };
		target.sampling = false;
		return {
			mounts: target.mounts,
			sameInput: target.input === document.getElementById("draft"),
			samples: target.samples,
		};
	});
	expect(retained.mounts).toBe(1);
	expect(retained.sameInput).toBe(true);
	expect(retained.samples).not.toContain("Hello world");
	expect(await f.frame.locator("#draft").inputValue()).toBe("my unsaved form input");
	expect(await f.frame.locator("#count").textContent()).toBe("1");
	expect(await f.frame.locator("#scroll").evaluate((el) => el.scrollTop)).toBe(90);
	await f.page.keyboard.press("ControlOrMeta+z");
	await expect.poll(() => label.textContent()).toBe("Hello world");
	expect(readFileSync(f.file, "utf8")).toBe(APP);
	await f.page.keyboard.press("ControlOrMeta+Shift+z");
	await expect.poll(() => label.textContent()).toBe("Saved & {literal}");
	await f.edit();
	await replace(f.page, "cancel me");
	await f.page.keyboard.press("Escape");
	await expect.poll(() => label.textContent()).toBe("Saved & {literal}");
	expect(readFileSync(f.file, "utf8")).not.toContain("cancel me");
	// The existing Properties surface uses the identical original-read path.
	await f.select();
	const field = f.page.getByRole("textbox", { name: "Text", exact: true });
	await expect.poll(() => field.count()).toBe(1);
	await field.fill('Rail "quote"\nsecond line');
	await field.press("Tab");
	expect(await field.evaluate((el) => el === document.activeElement)).toBe(false);
	await expect.poll(() => label.textContent()).toBe('Rail "quote"\nsecond line');
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain(JSON.stringify('Rail "quote"\nsecond line'));
	expect(await f.frame.locator("#draft").inputValue()).toBe("my unsaved form input");
});

it("reports a real retained memo mismatch after saving without reloading it away", { timeout: 120_000 }, async () => {
	const memo = APP.replace("const label=<h1", "const label=useMemo(()=><h1").replace(
		"Hello world</h1>;",
		"Hello world</h1>,[]);",
	);
	const f = await served(memo);
	await f.edit();
	await replace(f.page, "Saved but memoized");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain("Saved but memoized");
	await expect.poll(() => f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(1);
	expect(await f.frame.locator("#label").textContent()).toBe("Hello world");
	expect(await f.frame.locator("#label").evaluate(() => (window as unknown as { mounts: number }).mounts)).toBe(1);
	await f.page.keyboard.press("ControlOrMeta+z");
	await expect.poll(() => readFileSync(f.file, "utf8")).toBe(memo);
	expect(await f.frame.locator("#label").textContent()).toBe("Hello world");
});

it.each([
	{ text: "Wait", outcome: "pending" },
	{ text: "Fail", outcome: "failed" },
])("keeps saved source separate from authored Suspense $outcome", { timeout: 120_000 }, async ({ text, outcome }) => {
	const f = await served(`import {Suspense} from "react";
const waiting=new Promise(()=>{});
function Content(){const label=<h1 id="label">Hello world</h1>;if(label.props.children==="Wait")throw waiting;if(label.props.children==="Fail")throw new Error("authored failure");return label}
export default function Frame(){return <Suspense fallback={<p id="loading">loading</p>}><Content/></Suspense>}`);
	await f.edit();
	await replace(f.page, text);
	await f.page.keyboard.press("Enter");
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain(`>${text}</h1>`);
	await expect.poll(() => f.page.locator(`[data-hand-notice="${outcome}"]`).count()).toBe(1);
	if (outcome === "pending") expect(await f.frame.locator("#loading").textContent()).toBe("loading");
});

it("keeps native composition, late cancellation and application key ownership in the frame", {
	timeout: 120_000,
}, async () => {
	const f = await served(
		APP.replace(
			"export default function Frame(){",
			'addEventListener("keydown",()=>{window.appKeys=(window.appKeys||0)+1}); export default function Frame(){',
		),
	);
	await f.edit();
	const label = f.frame.locator("#label");
	const keys = await label.evaluate(() => (window as unknown as { appKeys?: number }).appKeys ?? 0);
	await f.page.keyboard.press("ControlOrMeta+a");
	const cdp = await f.page.context().newCDPSession(f.page);
	await cdp.send("Input.imeSetComposition", { text: "intermediate", selectionStart: 12, selectionEnd: 12 });
	expect(readFileSync(f.file, "utf8")).not.toContain("intermediate</h1>");
	await cdp.send("Input.insertText", { text: "完成" });
	await f.page.keyboard.press("Enter");
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain("完成</h1>");
	await expect.poll(() => label.textContent()).toBe("完成");
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
	expect(await label.evaluate(() => (window as unknown as { appKeys?: number }).appKeys ?? 0)).toBe(keys);
	await f.edit();
	await replace(f.page, "late words");
	await label.evaluate(() => dispatchEvent(new Event("blur")));
	await expect.poll(() => label.textContent()).toBe("完成");
	await label.evaluate((el) => {
		el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "late words" }));
		el.dispatchEvent(new InputEvent("input", { bubbles: true, data: "late words" }));
	});
	expect(readFileSync(f.file, "utf8")).not.toContain("late words</h1>");
});

it("retains a class instance and leaves direct uppercase helper calls as ordinary JavaScript", {
	timeout: 120_000,
}, async () => {
	const f = await served(`import {Component} from "react";
 function Words(){return <p>helper</p>}; const outside=Words();
 export default class Frame extends Component {state={count:0};componentDidMount(){window.mounts=(window.mounts||0)+1};render(){return <main><h1 id="label">Hello world</h1><button id="count" onClick={()=>this.setState({count:this.state.count+1})}>{this.state.count}</button>{outside}</main>}}`);
	const label = f.frame.locator("#label");
	const box = await label.boundingBox();
	if (!box) throw new Error("no label");
	await f.page.mouse.click(box.x + 20, box.y + 10);
	await f.page.keyboard.press("Enter");
	await f.frame.locator("#count").click();
	await f.page.keyboard.press("Escape");
	await expect
		.poll(() => f.page.locator('iframe[title="home"]').evaluate((el) => getComputedStyle(el).pointerEvents))
		.toBe("none");
	await f.edit();
	await replace(f.page, "Class saved");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => label.textContent()).toBe("Class saved");
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain("Class saved</h1>");
	expect(await f.frame.locator("#count").textContent()).toBe("1");
	expect(await label.evaluate(() => (window as unknown as { mounts: number }).mounts)).toBe(1);
});

it("lets an authored effect reset state exactly as an ordinary React update does", { timeout: 120_000 }, async () => {
	const body = `import {useEffect,useState} from "react";
 function Body({words}){const [count,setCount]=useState(0);const label=<h1 id="label">Hello world</h1>;
 useEffect(()=>{setCount(0);window.effects=[...(window.effects||[]),label.props.children]},[label.props.children]);
 useEffect(()=>{window.mounts=(window.mounts||0)+1},[]);
 return <main>{label}<button id="count" onClick={()=>setCount(n=>n+1)}>{count}</button><input id="draft" defaultValue="keep"/></main>}
 export default function Frame(){const [words,setWords]=useState("Hello world");window.changeWords=()=>setWords("Effect saved");return <Body words={words}/>} `;
	const retained = await served(body);
	const ordinary = await served(body.replace('id="label">Hello world</h1>', 'id="label">{words}</h1>'));
	for (const f of [retained, ordinary]) {
		const box = await f.frame.locator("#label").boundingBox();
		if (!box) throw new Error("no label");
		await f.page.mouse.click(box.x + 20, box.y + 10);
		await f.page.keyboard.press("Enter");
		await f.frame.locator("#count").click();
		await f.frame.locator("#draft").fill("unsaved");
		await f.page.keyboard.press("Escape");
		await expect
			.poll(() => f.page.locator('iframe[title="home"]').evaluate((el) => getComputedStyle(el).pointerEvents))
			.toBe("none");
	}
	await ordinary.frame.locator("#label").evaluate(() => (window as unknown as { changeWords(): void }).changeWords());
	await retained.edit();
	await replace(retained.page, "Effect saved");
	await retained.page.keyboard.press("Enter");
	await expect.poll(() => readFileSync(retained.file, "utf8")).toContain("Effect saved</h1>");
	for (const f of [retained, ordinary]) {
		await expect.poll(() => f.frame.locator("#count").textContent()).toBe("0");
		expect(await f.frame.locator("#draft").inputValue()).toBe("unsaved");
		expect(
			await f.frame.locator("#label").evaluate(() => ({
				effects: (window as unknown as { effects: string[] }).effects,
				mounts: (window as unknown as { mounts: number }).mounts,
			})),
		).toEqual({ effects: ["Hello world", "Effect saved"], mounts: 1 });
	}
});

it("refuses a timed-out publication after a coordinated Undo even when its message arrives late", {
	timeout: 120_000,
}, async () => {
	const f = await served();
	const label = f.frame.locator("#label");
	await label.evaluate(() => {
		const source = (
			window as unknown as {
				__SPOOL_SOURCE__?: { install: (publication: SourcePublication, undo?: boolean) => Promise<UseOutcome> };
			}
		).__SPOOL_SOURCE__;
		if (!source) throw new Error("no source runtime");
		const install = source.install;
		let held = false;
		source.install = (...args: Parameters<typeof install>) => {
			if (!held) {
				held = true;
				return new Promise((resolve) => {
					(window as unknown as { releaseOld(): void }).releaseOld = () => {
						void install(...args).then((result) => {
							(window as unknown as { oldOutcome: typeof result }).oldOutcome = result;
							resolve(result);
						});
					};
				});
			}
			return install(...args);
		};
	});
	await f.edit();
	await replace(f.page, "Delayed stale save");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain("Delayed stale save");
	await expect.poll(() => f.page.locator('[data-hand-notice="unverified"]').count(), { timeout: 12_000 }).toBe(1);
	const inverseDelivered = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
	);
	await f.page.keyboard.press("ControlOrMeta+z");
	await expect.poll(() => readFileSync(f.file, "utf8")).toBe(APP);
	await inverseDelivered;
	await label.evaluate(() => (window as unknown as { releaseOld(): void }).releaseOld());
	await expect
		.poll(() =>
			label.evaluate(
				() => (window as unknown as { oldOutcome?: { installation: string } }).oldOutcome?.installation,
			),
		)
		.toBe("refused");
	expect(await label.textContent()).toBe("Hello world");
});

it.each(["current", "admission"])(
	"clears only its owned preview when the %s source check refuses installation",
	{ timeout: 120_000 },
	async (phase) => {
		const f = await served();
		await f.page.route(phase === "admission" ? "**/source-admission/*" : "**/source", async (route) => {
			if (phase === "admission" || route.request().postDataJSON()?.action === "current") writeFileSync(f.file, APP);
			await route.continue();
		});
		await f.edit();
		await replace(f.page, "Preview must clear");
		await f.page.keyboard.press("Enter");
		await expect.poll(() => f.page.locator('[data-hand-notice="unverified"]').count(), { timeout: 12_000 }).toBe(1);
		expect(readFileSync(f.file, "utf8")).toBe(APP);
		expect(await f.frame.locator("#label").textContent()).toBe("Hello world");
	},
);
