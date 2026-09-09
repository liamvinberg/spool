import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";

async function screenshot(page: Page, path: string) {
	await page.locator("[data-dock]").evaluate(async (element) => {
		await Promise.all(
			element
				.getAnimations({ subtree: true })
				.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
				.map((animation) => animation.finished.catch(() => {})),
		);
	});
	await page.screenshot({ path });
}

async function served(source: string, client: BundledHostClient, directory: string, prepare?: (root: string) => void) {
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "home", source);
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":700,"h":500}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	prepare?.(project.root);
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.goto(`${project.url}/p/${project.name}`);
	const frame = page.frameLocator('iframe[title="home"]');
	await expect.poll(() => frame.locator("#label").count(), { timeout: 30_000 }).toBe(1);
	const file = join(project.root, "design/frames/home/frame.tsx");
	const select = async (selector = "#label") => {
		await expect.poll(() => page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		// Native Escape restores the host before its parent has released iframe
		// pointer ownership. The next canvas click belongs after that real release.
		await expect
			.poll(() =>
				page.locator('iframe[title="home"]').evaluate((element) => getComputedStyle(element).pointerEvents),
			)
			.toBe("none");
		const box = await frame.locator(selector).boundingBox();
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
			.toBe(selector);
		return box;
	};
	const edit = async (selector = "#label") => {
		const box = await select(selector);
		const reading = page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
		);
		await page.mouse.click(box.x + 40, box.y + box.height / 2);
		const result = await (await reading).json();
		expect(result.ok, result.reason).toBe(true);
		await expect.poll(() => frame.locator(selector).getAttribute("contenteditable")).toBe("plaintext-only");
	};
	const delivered = async (action: () => Promise<unknown>) => {
		const reply = page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "delivered",
		);
		await action();
		expect((await reply).ok()).toBe(true);
	};
	return { page, frame, file, select, edit, project, delivered };
}
async function withAgent(source: string) {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			cwd: state,
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		children.push(child);
		return child;
	});
	onTestFinished(async () => {
		for (const child of children)
			if (child.exitCode === null && child.signalCode === null) {
				const exited = once(child, "exit");
				child.kill();
				await exited;
			}
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const f = await served(source, client, directory);
	const callsFile = join(directory, "provider-calls.jsonl");
	const calls = () => (existsSync(callsFile) ? readFileSync(callsFile, "utf8") : "");
	const agentEdit = async (oldText: string, newText: string) => {
		const response = await fetch(`${f.project.url}/api/p/${f.project.name}/agent/turn`, {
			method: "POST",
			headers: { "X-Spool-Control": f.project.controlToken, "content-type": "application/json" },
			body: JSON.stringify({
				engine: "spool",
				thread: randomUUID(),
				said: [
					{
						selection: [],
						prompt: `file tools: ${JSON.stringify([
							{ name: "read", arguments: { path: f.file } },
							{ name: "edit", arguments: { path: f.file, edits: [{ oldText, newText }] } },
						])}`,
					},
				],
			}),
		});
		expect(response.ok).toBe(true);
		await response.text();
	};
	const composer = f.page.locator("[data-agent-rail] textarea");
	const properties = () => f.page.locator('[data-dock-glyph="properties"]').click();
	const notice = f.page.locator("[data-properties-rail] [data-hand-notice]");
	return { ...f, calls, agentEdit, composer, properties, notice };
}

const APP =
	'export default function Frame(){return <main style={{padding:40}}><h1 id="label">Hello world</h1><p id="other">Other target</p><input id="draft" defaultValue="initial" /></main>}';

it("hands a real conflict to the existing composer once and sends its original removed target only on explicit send", {
	timeout: 180000,
}, async () => {
	const f = await withAgent(APP);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	await f.composer.fill("My existing draft");
	await f.properties();
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("My retained words");
	await f.agentEdit("Hello world", "Agent words");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	expect(await f.notice.textContent()).toContain("My retained words");
	expect(await f.notice.textContent()).toContain('Checked current source: "Agent words"');
	expect(readFileSync(f.file, "utf8")).toContain("Agent words");
	await screenshot(f.page, "/tmp/spool-spec-132/310-actual-blocked.png");
	const before = f.calls();
	await f.select("#other");
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("My retained words");
	expect(await f.composer.inputValue()).toContain("My existing draft");
	expect(await f.composer.inputValue()).toContain("Target: home, #label");
	await expect.poll(() => f.composer.evaluate((element) => document.activeElement === element)).toBe(true);
	expect(f.calls()).toBe(before);
	await screenshot(f.page, "/tmp/spool-spec-132/310-actual-prepared.png");
	const prepared = await f.composer.inputValue();
	await f.properties();
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	expect(await f.composer.inputValue()).toBe(prepared);
	await f.properties();
	await f.notice.getByRole("button", { name: "Dismiss notice" }).click();
	expect(await f.notice.count()).toBe(0);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	expect(await f.composer.inputValue()).toBe(prepared);
	// Real source removal after preparation cannot change the captured transport selection.
	await f.agentEdit('<h1 id="label">Agent words</h1>', "");
	const afterRemoval = f.calls();
	const outgoing = f.page.waitForRequest(
		(request) => request.url().endsWith("/agent/turn") && request.method() === "POST",
	);
	await f.composer.press("Enter");
	const sent = (await outgoing).postDataJSON();
	expect(JSON.stringify(sent)).toContain("My retained words");
	expect(JSON.stringify(sent)).toContain("#label");
	expect(JSON.stringify(sent)).not.toContain('"selector":"#other"');
	await expect.poll(f.calls, { timeout: 20000 }).not.toBe(afterRemoval);
	expect(f.calls().slice(afterRemoval.length)).toContain("My retained words");
	expect(f.calls().slice(afterRemoval.length)).toContain("#label");
	expect(readFileSync(f.file, "utf8")).not.toContain("My retained words");
});

it("retains a real saved memo mismatch, keeps reload explicit, and retires its prepared prompt on verified Undo", {
	timeout: 180000,
}, async () => {
	const source =
		'import {useMemo,useEffect} from "react";export default function Frame(){const label=useMemo(()=><h1 id="label">Hello world</h1>,[]);useEffect(()=>{window.mounts=(window.mounts||0)+1},[]);return <main style={{padding:40}}>{label}<p id="other">Other target</p><input id="draft" defaultValue="initial" /></main>}';
	const f = await withAgent(source);
	await f.frame.locator("#draft").fill("native state");
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Saved memo words");
	await f.delivered(() => f.page.keyboard.press("Enter"));
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
	expect(await f.frame.locator("#label").textContent()).toBe("Hello world");
	expect(readFileSync(f.file, "utf8")).toContain("Saved memo words");
	expect(await f.frame.locator("#draft").inputValue()).toBe("native state");
	expect(await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).count()).toBe(1);
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("Saved memo words");
	expect(f.calls()).toBe("");
	await f.properties();
	await f.page.mouse.click(5, 5);
	await f.delivered(() => f.page.keyboard.press("ControlOrMeta+z"));
	await expect.poll(() => readFileSync(f.file, "utf8")).toBe(source);
	await expect.poll(() => f.notice.count()).toBe(0);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	await expect.poll(() => f.composer.inputValue()).toBe("");
	expect(f.calls()).toBe("");
});

it("retries a conflict with fresh authority for the original owner and never retargets to the later selection", {
	timeout: 180000,
}, async () => {
	const f = await withAgent(APP);
	await f.frame.locator("#draft").fill("retained native input");
	const commits: unknown[] = [];
	f.page.on("request", (request) => {
		if (
			request.url().endsWith("/source") &&
			request.method() === "POST" &&
			request.postDataJSON()?.action === "commit"
		)
			commits.push(request.postDataJSON());
	});
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Retry my words");
	await f.agentEdit("Hello world", "Agent words");
	await f.agentEdit("Other target", "Agent body");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	await f.select("#other");
	const previous = commits.length;
	await f.notice.getByRole("button", { name: "Retry this edit" }).click();
	await expect
		.poll(async () => ({
			source: readFileSync(f.file, "utf8"),
			notice: (await f.notice.count()) ? await f.notice.textContent() : null,
		}))
		.toEqual({ source: expect.stringContaining("Retry my words"), notice: null });
	expect(commits.length).toBe(previous + 1);
	expect(readFileSync(f.file, "utf8")).toContain("Agent body");
	await expect.poll(() => f.frame.locator("#label").textContent()).toBe("Retry my words");
	await expect.poll(() => f.notice.count()).toBe(0);
	await f.page.mouse.click(5, 5);
	await f.delivered(() => f.page.keyboard.press("ControlOrMeta+z"));
	await expect.poll(() => readFileSync(f.file, "utf8")).toContain("Agent words");
	expect(readFileSync(f.file, "utf8")).toContain("Agent body");
	await expect.poll(() => f.frame.locator("#label").textContent()).toBe("Agent words");
	expect(await f.frame.locator("#draft").inputValue()).toBe("retained native input");
});

it("keeps pre-transaction calculated text intent, deduplicates it, and opens a generic request without the old failure", {
	timeout: 180000,
}, async () => {
	const f = await withAgent(APP.replace("Hello world", '{["Hello", "world"].join(" ")}'));
	await f.select();
	const field = f.page.getByRole("textbox", { name: "Text", exact: true });
	await field.fill("Requested computed words");
	await field.press("Enter");
	await expect.poll(() => f.notice.textContent()).toContain("Requested computed words");
	expect(await f.frame.locator("#label").textContent()).toBe("Hello world");
	const source = readFileSync(f.file, "utf8");
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("Requested computed words");
	expect(await f.composer.inputValue()).toContain("Role: not established");
	await f.properties();
	await f.notice.getByRole("button", { name: "Dismiss notice" }).click();
	expect(readFileSync(f.file, "utf8")).toBe(source);
	await field.fill("Fresh failed attempt");
	await field.press("Enter");
	await expect.poll(() => f.notice.textContent()).toContain("Fresh failed attempt");
	await f.notice.getByRole("button", { name: "Dismiss notice" }).click();
	await f.select("#other");
	await f.page.getByRole("button", { name: "Element actions", exact: true }).click();
	await f.page.getByRole("option", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toBe("");
	expect(f.calls()).toBe("");
	await f.composer.fill("What can I change here?");
	await screenshot(f.page, "/tmp/spool-spec-132/310-actual-generic.png");
	const outgoing = f.page.waitForRequest(
		(request) => request.url().endsWith("/agent/turn") && request.method() === "POST",
	);
	await f.composer.press("Enter");
	const sent = JSON.stringify((await outgoing).postDataJSON());
	expect(sent).toContain("#other");
	expect(sent).not.toContain("Requested computed words");
});

it("refuses a retry after the same native host switches to another literal owner", { timeout: 180000 }, async () => {
	const source =
		'import {useState} from "react";function Label({text}){return <h1 id="label">{text}</h1>}export default function Frame(){const [other,setOther]=useState(false);return <main style={{padding:40}}>{other?<Label text="Owner B"/>:<Label text="Owner A"/>}<button id="switch" onClick={()=>setOther(true)}>Switch owner</button><p id="other">Other target</p></main>}';
	const f = await withAgent(source);
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Requested A");
	await f.agentEdit("Owner A", "Agent A");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	await f.frame.locator("#label").evaluate((element) => Reflect.set(window, "originalHost", element));
	await f.frame.locator("#switch").evaluate((element) => {
		if (element instanceof HTMLElement) element.click();
	});
	await expect.poll(() => f.frame.locator("#label").textContent()).toBe("Owner B");
	expect(await f.frame.locator("#label").evaluate((element) => element === Reflect.get(window, "originalHost"))).toBe(
		true,
	);
	const before = readFileSync(f.file, "utf8");
	const commits: unknown[] = [];
	f.page.on("request", (request) => {
		if (
			request.url().endsWith("/source") &&
			request.method() === "POST" &&
			request.postDataJSON()?.action === "commit"
		)
			commits.push(request.postDataJSON());
	});
	await f.notice.getByRole("button", { name: "Retry this edit" }).click();
	await expect.poll(() => f.notice.textContent()).toContain("owner changed");
	expect(commits).toEqual([]);
	expect(await f.notice.textContent()).not.toContain("Checked current source");
	expect(readFileSync(f.file, "utf8")).toBe(before);
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("Requested A");
	expect(await f.composer.inputValue()).toContain("Owner A");
});

it("refuses a non-target mode change in the original call ancestry before retry can write", {
	timeout: 180000,
}, async () => {
	const source =
		'function Label({mode}){return mode==="a"?<h1 id="label">Owner A</h1>:<h1 id="label">Owner B</h1>}export default function Frame(){return <main style={{padding:40}}><Label mode="a"/><p id="other">Other target</p></main>}';
	const f = await withAgent(source);
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Requested A");
	await f.agentEdit("Owner A", "Agent A");
	await f.agentEdit('mode="a"', 'mode="b"');
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	const before = readFileSync(f.file, "utf8");
	const commits: unknown[] = [];
	f.page.on("request", (request) => {
		if (
			request.url().endsWith("/source") &&
			request.method() === "POST" &&
			request.postDataJSON()?.action === "commit"
		)
			commits.push(request.postDataJSON());
	});
	const checked = f.page.waitForResponse(
		(response) =>
			response.url().endsWith("/source") &&
			response.request().postDataJSON()?.action === "read" &&
			response.request().postDataJSON()?.retry,
	);
	await f.notice.getByRole("button", { name: "Retry this edit" }).click();
	expect((await (await checked).json()).ok).toBe(false);
	await expect.poll(() => f.notice.textContent()).toContain("call ancestry changed");
	expect(commits).toEqual([]);
	expect(readFileSync(f.file, "utf8")).toBe(before);
});

it("checks an unknown save explicitly without replaying it or inventing Undo", { timeout: 180000 }, async () => {
	const f = await withAgent(APP);
	let dropped = false;
	const commits: unknown[] = [];
	await f.page.route("**/source", async (route) => {
		const body = route.request().postDataJSON();
		if (body?.action === "commit") {
			commits.push(body);
			const response = await route.fetch();
			expect((await response.json()).ok).toBe(true);
			if (!dropped) {
				dropped = true;
				await route.abort("failed");
				return;
			}
			await route.fulfill({ response });
			return;
		}
		await route.continue();
	});
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Unacknowledged words");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("unknown");
	expect(readFileSync(f.file, "utf8")).toContain("Unacknowledged words");
	expect(commits).toHaveLength(1);
	expect(await f.notice.getByRole("button", { name: "Retry this edit" }).count()).toBe(0);
	await f.notice.getByRole("button", { name: "Check current source" }).click();
	await expect.poll(() => f.notice.textContent()).toContain('Current source says "Unacknowledged words"');
	expect(commits).toHaveLength(1);
	expect(await f.notice.getAttribute("data-hand-notice")).toBe("unknown");
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("Unacknowledged words");
	expect(f.calls()).toBe("");
});

it("a later competing write still refuses a freshly prepared retry", { timeout: 180000 }, async () => {
	const f = await withAgent(APP);
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Retried intention");
	await f.agentEdit("Hello world", "Agent first");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	let fresh = false;
	let release = () => {};
	const continued = new Promise<void>((resolve) => {
		release = resolve;
	});
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action === "read" && route.request().postDataJSON()?.retry) {
			const response = await route.fetch();
			expect((await response.json()).ok).toBe(true);
			fresh = true;
			await continued;
			await route.fulfill({ response });
			return;
		}
		await route.continue();
	});
	await f.notice.getByRole("button", { name: "Retry this edit" }).click();
	await expect.poll(() => fresh).toBe(true);
	await f.agentEdit("Agent first", "Agent latest");
	release();
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	expect(readFileSync(f.file, "utf8")).toContain("Agent latest");
	expect(readFileSync(f.file, "utf8")).not.toContain("Retried intention");
	expect(await f.notice.textContent()).toContain("Retried intention");
});

it("sends retained mismatch context through the real transport and reloads only on the explicit state-reset action", {
	timeout: 180000,
}, async () => {
	const source =
		'import {useMemo} from "react";export default function Frame(){const label=useMemo(()=><h1 id="label">Hello world</h1>,[]);return <main style={{padding:40}}>{label}<p id="other">Other target</p><input id="draft" defaultValue="initial" /></main>}';
	const f = await withAgent(source);
	const commits: unknown[] = [];
	f.page.on("request", (request) => {
		if (
			request.url().endsWith("/source") &&
			request.method() === "POST" &&
			request.postDataJSON()?.action === "commit"
		)
			commits.push(request.postDataJSON());
	});
	await f.frame.locator("#draft").fill("state before explicit reload");
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Saved after reload");
	await f.delivered(() => f.page.keyboard.press("Enter"));
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
	await f.select("#other");
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("Saved after reload");
	expect(f.calls()).toBe("");
	expect(await f.frame.locator("#draft").inputValue()).toBe("state before explicit reload");
	const outgoing = f.page.waitForRequest(
		(request) => request.url().endsWith("/agent/turn") && request.method() === "POST",
	);
	await f.composer.press("Enter");
	const sent = JSON.stringify((await outgoing).postDataJSON());
	expect(sent).toContain("#label");
	expect(sent).toContain("Saved after reload");
	expect(sent).not.toContain('"selector":"#other"');
	await expect.poll(f.calls, { timeout: 20000 }).toContain("Saved after reload");
	await f.properties();
	const bytes = readFileSync(f.file, "utf8");
	await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
	await expect.poll(() => f.frame.locator("#label").textContent()).toBe("Saved after reload");
	expect(await f.frame.locator("#draft").inputValue()).toBe("initial");
	expect(commits).toHaveLength(1);
	expect(readFileSync(f.file, "utf8")).toBe(bytes);
	await expect.poll(() => f.notice.count()).toBe(0);
});

it.each([false, true])(
	"retires the resolved older attempt while preserving another request and draft (other thread: %s)",
	{ timeout: 180000 },
	async (otherThread) => {
		const source =
			'import {useMemo} from "react";export default function Frame(){return <main style={{padding:40}}>{useMemo(()=><h1 id="label">Hello world</h1>,[])}<p id="other">Other target</p><input id="draft" defaultValue="initial" /></main>}';
		const f = await withAgent(source);
		await f.page.locator('[data-dock-glyph="agent"]').click();
		await f.composer.fill("Keep my own draft");
		await f.properties();
		await f.edit();
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Attempt A memo");
		await f.delivered(() => f.page.keyboard.press("Enter"));
		await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
		await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
		await expect.poll(() => f.composer.inputValue()).toContain("Attempt A memo");
		if (otherThread) {
			await f.page.locator('[data-agent-rail] button[aria-label="New chat"]').click();
			await f.composer.fill("Second thread draft");
		}
		await f.properties();
		await f.edit("#other");
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Attempt B conflict");
		await f.agentEdit("Other target", "Agent body");
		await f.page.keyboard.press("Enter");
		await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
		const callsBeforeHandoff = f.calls();
		await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
		await expect.poll(() => f.composer.inputValue()).toContain("Attempt B conflict");
		await f.properties();
		await f.page.mouse.click(5, 5);
		await f.delivered(() => f.page.keyboard.press("ControlOrMeta+z"));
		await expect.poll(() => readFileSync(f.file, "utf8")).toBe(source.replace("Other target", "Agent body"));
		await f.page.locator('[data-dock-glyph="agent"]').click();
		await expect.poll(() => f.composer.inputValue()).toContain("Attempt B conflict");
		await expect.poll(() => f.composer.inputValue()).not.toContain("Attempt A memo");
		if (otherThread) {
			expect(await f.composer.inputValue()).toContain("Second thread draft");
			await f.page.locator("[data-agent-plate-ask]").click();
			await f.page.locator('[data-agent-thread]:not([aria-current="true"])').click();
			await expect.poll(() => f.composer.inputValue()).toBe("Keep my own draft");
		} else {
			expect(await f.composer.inputValue()).toContain("Keep my own draft");
		}
		expect(f.calls()).toBe(callsBeforeHandoff);
	},
);

it("does not invent a new save or verified result when fresh retry source already contains the request", {
	timeout: 180000,
}, async () => {
	const f = await withAgent(APP);
	await f.frame.locator("#draft").fill("retained native state");
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Already requested");
	await f.agentEdit("Hello world", "Already requested");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	const before = readFileSync(f.file, "utf8");
	const response = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await f.notice.getByRole("button", { name: "Retry this edit" }).click();
	expect(await (await response).json()).toEqual({ ok: true, source: "unchanged", publication: null });
	await expect.poll(() => f.notice.textContent()).toContain("No new edit was saved");
	expect(await f.notice.getAttribute("data-hand-notice")).toBe("unverified");
	expect(await f.notice.locator("strong").textContent()).toBe("No new edit saved");
	expect(readFileSync(f.file, "utf8")).toBe(before);
	expect(await f.frame.locator("#label").textContent()).toBe("Hello world");
	expect(await f.frame.locator("#draft").inputValue()).toBe("retained native state");
	const callsBeforeHandoff = f.calls();
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("Already requested");
	expect(f.calls()).toBe(callsBeforeHandoff);
	const writes: string[] = [];
	f.page.on("request", (request) => {
		if (request.url().endsWith("/source") && ["commit", "inverse"].includes(request.postDataJSON()?.action))
			writes.push(request.postDataJSON().action);
	});
	await f.properties();
	await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
	await expect.poll(() => f.frame.locator("#label").textContent()).toBe("Already requested");
	await expect.poll(() => f.notice.count()).toBe(0);
	expect(await f.frame.locator("#draft").inputValue()).toBe("initial");
	expect(readFileSync(f.file, "utf8")).toBe(before);
	expect(writes).toEqual([]);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	await expect.poll(() => f.composer.inputValue()).toBe("");
	expect(f.calls()).toBe(callsBeforeHandoff);
});

it("preserves Properties scroll and field state across the approved reduced-motion Agent handoff", {
	timeout: 180000,
}, async () => {
	const f = await withAgent(APP);
	await f.page.setViewportSize({ width: 1440, height: 560 });
	await f.page.emulateMedia({ reducedMotion: "reduce" });
	await f.composer.evaluate((element) => element.focus());
	expect(await f.composer.evaluate((element) => document.activeElement === element)).toBe(false);
	expect(await f.composer.evaluate((element) => element.closest("[inert]") !== null)).toBe(true);
	await expect(f.composer.click({ timeout: 200 })).rejects.toThrow();
	expect(f.calls()).toBe("");
	await f.select();
	const rail = f.page.locator("[data-properties-rail]");
	const scroll = rail.locator("div.overflow-y-auto").first();
	await scroll.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	const top = await scroll.evaluate((element) => element.scrollTop);
	expect(top).toBeGreaterThan(0);
	const field = f.page.getByRole("textbox", { name: "Text", exact: true });
	const value = await field.inputValue();
	await rail.getByRole("button", { name: "Element actions", exact: true }).click();
	await f.page.getByRole("option", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.evaluate((element) => document.activeElement === element)).toBe(true);
	await f.composer.fill("Keep these unsent words");
	await f.properties();
	expect(await scroll.evaluate((element) => element.scrollTop)).toBe(top);
	expect(await field.inputValue()).toBe(value);
	expect(await f.frame.locator("#label").textContent()).toBe("Hello world");
	const transitions = await f.page
		.locator("[data-dock-panel], [data-dock-panel] > div")
		.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transitionProperty));
	expect(transitions.length).toBeGreaterThan(0);
	expect(transitions.every((property) => property === "none")).toBe(true);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	expect(await f.composer.inputValue()).toBe("Keep these unsent words");
	expect(f.calls()).toBe("");
});

it.each(["reload", "redo"])(
	"resolves a saved-but-unapplied retry Undo through %s using its actual expectation",
	{
		timeout: 180000,
	},
	async (recovery) => {
		const source =
			'import {useMemo} from "react";export default function Frame(){const label=useMemo(()=><h1 id="label">Hello world</h1>,[]);return <main style={{padding:40}}>{label}<p id="other">Other target</p><input id="draft" defaultValue="initial" /></main>}';
		const f = await withAgent(source);
		await f.page.locator('[data-dock-glyph="agent"]').click();
		await f.composer.fill("Keep my unrelated draft");
		await f.properties();
		await f.edit();
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("My retry words");
		await f.agentEdit("Hello world", "Agent previous words");
		await f.page.keyboard.press("Enter");
		await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
		await f.notice.getByRole("button", { name: "Retry this edit" }).click();
		await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
		await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
		await expect.poll(() => f.frame.locator("#label").textContent()).toBe("My retry words");
		await expect.poll(() => f.notice.count()).toBe(0);
		await f.frame.locator("#draft").fill("Before explicit undo reload");
		await f.page.mouse.click(5, 5);
		await f.delivered(() => f.page.keyboard.press("ControlOrMeta+z"));
		await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
		expect(readFileSync(f.file, "utf8")).toContain("Agent previous words");
		expect(await f.frame.locator("#label").textContent()).toBe("My retry words");
		expect(await f.frame.locator("#draft").inputValue()).toBe("Before explicit undo reload");
		await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
		await expect.poll(() => f.composer.inputValue()).toContain('undo change text to "Agent previous words"');
		expect(await f.composer.inputValue()).not.toContain('to "My retry words"');
		const beforeReload = readFileSync(f.file, "utf8");
		const calls = f.calls();
		await f.properties();
		if (recovery === "redo") {
			await f.page.mouse.click(5, 5);
			await f.delivered(() => f.page.keyboard.press("ControlOrMeta+Shift+z"));
			await expect.poll(() => f.notice.count()).toBe(0);
			expect(readFileSync(f.file, "utf8")).toContain("My retry words");
			expect(await f.frame.locator("#label").textContent()).toBe("My retry words");
			expect(await f.frame.locator("#draft").inputValue()).toBe("Before explicit undo reload");
			await f.page.locator('[data-dock-glyph="agent"]').click();
			await expect.poll(() => f.composer.inputValue()).toBe("Keep my unrelated draft");
			expect(f.calls()).toBe(calls);
			return;
		}
		await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
		await expect.poll(() => f.frame.locator("#label").textContent()).toBe("Agent previous words");
		await expect.poll(() => f.notice.count()).toBe(0);
		expect(readFileSync(f.file, "utf8")).toBe(beforeReload);
		expect(await f.frame.locator("#draft").inputValue()).toBe("initial");
		await f.page.locator('[data-dock-glyph="agent"]').click();
		await expect.poll(() => f.composer.inputValue()).toBe("Keep my unrelated draft");
		expect(f.calls()).toBe(calls);
	},
);

it("retires only the appended recovery segment when identical text already belongs to the person's draft", {
	timeout: 180000,
}, async () => {
	const f = await withAgent(APP);
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("My duplicate-context request");
	await f.agentEdit("Hello world", "Agent words");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("My duplicate-context request");
	const generated = await f.composer.inputValue();
	await f.properties();
	await f.select("#other");
	await f.page.getByRole("button", { name: "Element actions", exact: true }).click();
	await f.page.getByRole("option", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toBe("");
	const ownDraft = `My copied paragraph\n\n${generated}\n\nKeep this ending`;
	await f.composer.fill(ownDraft);
	await f.properties();
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toBe(`${ownDraft}\n\n${generated}`);
	await f.properties();
	await f.notice.getByRole("button", { name: "Retry this edit" }).click();
	await expect.poll(() => f.notice.count()).toBe(0);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	await expect.poll(() => f.composer.inputValue()).toBe(ownDraft);
	expect(await f.frame.locator("#label").textContent()).toBe("My duplicate-context request");
});

it("distinguishes an inverse's absent title from another editor's empty title on explicit reload", {
	timeout: 180000,
}, async () => {
	const source =
		'import {useMemo} from "react";export default function Frame(){const label=useMemo(()=><h1 id="label">Hello world</h1>,[]);return <main style={{padding:40}}>{label}<p id="other">Other target</p></main>}';
	const f = await withAgent(source);
	await f.select();
	const field = f.page.getByRole("textbox", { name: "title", exact: true });
	await field.fill("Authored title");
	await f.delivered(() => field.press("Enter"));
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
	await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
	await expect.poll(() => f.frame.locator("#label").getAttribute("title")).toBe("Authored title");
	await expect.poll(() => f.notice.count()).toBe(0);
	await f.page.mouse.click(5, 5);
	await f.delivered(() => f.page.keyboard.press("ControlOrMeta+z"));
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("mismatching");
	expect(readFileSync(f.file, "utf8")).toBe(source);
	await f.agentEdit('<h1 id="label">', '<h1 id="label" title="">');
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("Requested result: title is absent");
	await f.properties();
	await f.page.evaluate(() => {
		Reflect.set(window, "reloadVerified", false);
		window.addEventListener("message", (event) => {
			if (event.data?.spool === "source-reply" && event.data.result?.rendered)
				Reflect.set(window, "reloadVerified", true);
		});
	});
	await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
	await expect.poll(() => f.frame.locator("#label").getAttribute("title")).toBe("");
	// Wait for the actual read-only reload description, then the notice must remain:
	// an empty present attribute has not achieved the inverse's absent expectation.
	await expect.poll(() => f.page.evaluate(() => Reflect.get(window, "reloadVerified"))).toBe(true);
	await f.page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
	);
	expect(await f.notice.count()).toBe(1);
	expect(readFileSync(f.file, "utf8")).toContain('title=""');
	await f.agentEdit('<h1 id="label" title="">', '<h1 id="label">');
	await f.notice.getByRole("button", { name: "Reload app (resets state)", exact: true }).click();
	await expect.poll(() => f.frame.locator("#label").getAttribute("title")).toBe(null);
	await expect.poll(() => f.notice.count()).toBe(0);
	expect(readFileSync(f.file, "utf8")).toBe(source);
	await f.page.locator('[data-dock-glyph="agent"]').click();
	await expect.poll(() => f.composer.inputValue()).toBe("");
});

it("discloses checked current property source after a real competing edit without replacing the original intent", {
	timeout: 180_000,
}, async () => {
	const f = await withAgent(APP.replace('<h1 id="label">', '<h1 id="label" className="opacity-75">'));
	await f.select();
	const field = f.page.locator('[data-properties-row="opacity"] input').first();
	await field.fill("50");
	await expect
		.poll(() => f.frame.locator("#label").evaluate((element) => getComputedStyle(element).opacity))
		.toBe("0.5");
	await f.agentEdit("opacity-75", "opacity-25");
	const replied = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await field.press("Enter");
	const result = await (await replied).json();
	expect(result).toMatchObject({
		ok: false,
		current: { kind: "property", value: { kind: "binding", tokens: ["opacity-25"] } },
	});
	await expect.poll(() => f.notice.getAttribute("data-hand-notice")).toBe("blocked");
	expect(await f.notice.textContent()).toContain("opacity-25");
	expect(readFileSync(f.file, "utf8")).toContain("opacity-25");
	expect(await f.frame.locator("#label").evaluate((element) => getComputedStyle(element).opacity)).toBe("0.75");
	const calls = f.calls();
	await f.notice.getByRole("button", { name: "Ask agent", exact: true }).click();
	await expect.poll(() => f.composer.inputValue()).toContain("opacity-50");
	expect(await f.composer.inputValue()).toContain("Target: home, #label");
	expect(f.calls()).toBe(calls);
});

it("withholds property current-source evidence when another original ancestry field changed", {
	timeout: 180_000,
}, async () => {
	const f = await withAgent(APP.replace('<h1 id="label">', '<h1 id="label" className="opacity-75">'));
	await f.select();
	const field = f.page.locator('[data-properties-row="opacity"] input').first();
	await field.fill("50");
	await expect
		.poll(() => f.frame.locator("#label").evaluate((element) => getComputedStyle(element).opacity))
		.toBe("0.5");
	await f.agentEdit('id="label" className="opacity-75"', 'id="changed" className="opacity-25"');
	const replied = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
	);
	await field.press("Enter");
	const result = await (await replied).json();
	expect(result).toMatchObject({ ok: false });
	expect(result.current).toBeUndefined();
	expect(readFileSync(f.file, "utf8")).toContain('id="changed" className="opacity-25"');
	expect(await f.notice.textContent()).not.toContain("Checked current source");
	expect(await f.frame.locator("#label").count()).toBe(1);
});
