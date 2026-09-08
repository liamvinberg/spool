import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";

async function served(source: string, client: BundledHostClient, directory: string, prepare?: (root: string) => void) {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "home", source);
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":700,"h":500}');
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	prepare?.(project.root);
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
	return { page, frame, file, select, edit, project };
}
for (const order of ["agent first", "hand first"] as const) {
	it(`preserves actual bundled HTTP edits and hand Undo/Redo through the served canvas: ${order}`, {
		timeout: 180_000,
	}, async () => {
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
		const f = await served(
			'export default function Frame(){return <main style={{padding:40}}><h1 id="label">Hello world</h1><p id="body">Original body</p><input id="draft" defaultValue="keep" /></main>}',
			client,
			directory,
		);
		const supervisor = client.source;
		if (!supervisor) throw new Error("daemon did not attach the source owner");
		let readDone = false,
			release = () => {};
		const resumed = new Promise<void>((resolve) => {
			release = resolve;
		});
		client.source = {
			open: (options, generation) => {
				const authority = supervisor.open(options, generation);
				return {
					revoke: () => authority.revoke(),
					request: async (request) => {
						const reply = await authority.request(request);
						if (request.kind === "read-complete") {
							readDone = true;
							await resumed;
						}
						return reply;
					},
				};
			},
		};
		await f.edit();
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("My words");
		const turn = fetch(`${f.project.url}/api/p/${f.project.name}/agent/turn`, {
			method: "POST",
			headers: { "X-Spool-Control": f.project.controlToken, "content-type": "application/json" },
			body: JSON.stringify({
				engine: "spool",
				thread: randomUUID(),
				said: [
					{
						prompt: `file tools: ${JSON.stringify([
							{ name: "read", arguments: { path: f.file } },
							{
								name: "edit",
								arguments: { path: f.file, edits: [{ oldText: "Original body", newText: "Agent body" }] },
							},
						])}`,
						selection: [],
					},
				],
			}),
		}).then(async (response) => {
			expect(response.ok).toBe(true);
			return response.text();
		});
		await expect.poll(() => readDone, { timeout: 20_000 }).toBe(true);
		if (order === "agent first") {
			release();
			await turn;
			expect(readFileSync(f.file, "utf8")).toContain("Agent body");
			expect(readFileSync(f.file, "utf8")).toContain("Hello world");
		}
		await f.page.keyboard.press("Enter");
		await expect
			.poll(
				async () => ({
					source: readFileSync(f.file, "utf8"),
					notice: await f.page.locator("[data-hand-notice]").allTextContents(),
					editing: await f.frame.locator("#label").getAttribute("contenteditable"),
				}),
				{ timeout: 20_000 },
			)
			.toEqual({ source: expect.stringContaining("My words"), notice: [], editing: null });
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		if (order === "hand first") {
			release();
			await turn;
		}
		await expect.poll(() => f.frame.locator("#body").textContent(), { timeout: 20_000 }).toBe("Agent body");
		await expect
			.poll(async () => ({
				text: await f.frame.locator("#label").textContent(),
				notice: await f.page.locator("[data-hand-notice]").allTextContents(),
			}))
			.toMatchObject({ text: "My words" });
		await f.page.keyboard.press("ControlOrMeta+z");
		await expect.poll(() => readFileSync(f.file, "utf8")).toContain("Hello world");
		await expect.poll(() => f.frame.locator("#label").textContent()).toBe("Hello world");
		expect(await f.frame.locator("#body").textContent()).toBe("Agent body");
		await f.page.keyboard.press("ControlOrMeta+Shift+z");
		await expect.poll(() => f.frame.locator("#label").textContent()).toBe("My words");
		expect(readFileSync(f.file, "utf8")).toContain("Agent body");
		const source = readFileSync(f.file, "utf8");
		await f.edit();
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("cancelled intent");
		await f.page.keyboard.press("Escape");
		expect(readFileSync(f.file, "utf8")).toBe(source);
		if (order === "agent first") {
			await f.edit();
			await f.page.keyboard.press("ControlOrMeta+a");
			await f.page.keyboard.insertText("keep my conflict intent");
			const conflict = await fetch(`${f.project.url}/api/p/${f.project.name}/agent/turn`, {
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
								{
									name: "edit",
									arguments: { path: f.file, edits: [{ oldText: "My words", newText: "Agent words" }] },
								},
							])}`,
						},
					],
				}),
			});
			expect(conflict.ok).toBe(true);
			await conflict.text();
			await f.page.keyboard.press("Enter");
			await expect
				.poll(() => f.page.locator('[data-hand-notice="blocked"]').textContent())
				.toContain("keep my conflict intent");
			expect(readFileSync(f.file, "utf8")).toContain("Agent words");
			await f.page.getByRole("button", { name: "Dismiss notice" }).click();
			await f.page.keyboard.press("ControlOrMeta+z");
			await expect.poll(() => f.page.locator('[data-hand-notice="blocked"]').textContent()).toContain("touched");
			await f.page.keyboard.press("ControlOrMeta+z");
			expect(readFileSync(f.file, "utf8")).toContain("Agent words");
		} else {
			let prepared = false,
				continuePrepare = () => {};
			const gate = new Promise<void>((resolve) => {
				continuePrepare = resolve;
			});
			client.source = {
				open: (options, generation) => {
					const authority = supervisor.open(options, generation);
					return {
						revoke: () => authority.revoke(),
						request: async (request) => {
							const response = await authority.request(request);
							if (request.kind === "prepare") {
								prepared = true;
								await gate;
							}
							return response;
						},
					};
				},
			};
			const namedTurn = randomUUID();
			const cancelled = fetch(`${f.project.url}/api/p/${f.project.name}/agent/turn`, {
				method: "POST",
				headers: { "X-Spool-Control": f.project.controlToken, "content-type": "application/json" },
				body: JSON.stringify({
					engine: "spool",
					thread: randomUUID(),
					turn: namedTurn,
					said: [
						{
							selection: [],
							prompt: `file tools: ${JSON.stringify([
								{ name: "read", arguments: { path: f.file } },
								{
									name: "edit",
									arguments: { path: f.file, edits: [{ oldText: "My words", newText: "cancelled agent" }] },
								},
							])}`,
						},
					],
				}),
			}).then((response) => response.text());
			await expect.poll(() => prepared).toBe(true);
			const stopped = await fetch(`${f.project.url}/api/p/${f.project.name}/agent/interrupt`, {
				method: "POST",
				headers: { "X-Spool-Control": f.project.controlToken, "content-type": "application/json" },
				body: JSON.stringify({ turn: namedTurn }),
			});
			expect(stopped.status).toBe(204);
			continuePrepare();
			await cancelled;
			expect(readFileSync(f.file, "utf8")).toBe(source);
		}

		expect(readFileSync(join(directory, "provider-calls.jsonl"), "utf8")).not.toContain('"handle"');
	});
}
it("shows a real lost agent write acknowledgment in the canvas without replaying and keeps the next draft", {
	timeout: 180_000,
}, async () => {
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
	const f = await served(
		'export default () => <main><h1 id="label">Hello world</h1><p id="body">Original body</p></main>',
		client,
		directory,
	);
	const supervisor = client.source;
	if (!supervisor) throw new Error("missing actual source owner");
	let replaced = false,
		release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	client.source = {
		open: (options, generation) => {
			const authority = supervisor.open(options, generation);
			return {
				revoke: () => authority.revoke(),
				unknown: () => authority.unknown?.() ?? false,
				request: async (request) => {
					const response = await authority.request(request);
					if (request.kind === "replace") {
						replaced = true;
						await held;
					}
					return response;
				},
			};
		},
	};
	await f.page.locator('[data-dock-glyph="agent"]').click();
	const rail = f.page.locator("[data-agent-rail]");
	const draft = rail.locator("textarea");
	const send = async (from: string, to: string) => {
		await draft.fill(
			`file tools: ${JSON.stringify([
				{ name: "read", arguments: { path: f.file } },
				{ name: "edit", arguments: { path: f.file, edits: [{ oldText: from, newText: to }] } },
			])}`,
		);
		await draft.press("Enter");
	};
	await send("Original body", "Agent body");
	await expect.poll(() => replaced, { timeout: 20_000 }).toBe(true);
	expect(readFileSync(f.file, "utf8")).toContain("Agent body");
	await draft.fill("Keep this separate next request.");
	const host = children.at(-1);
	if (!host) throw new Error("missing real host");
	const exited = once(host, "exit");
	host.kill("SIGKILL");
	await exited;
	release();
	await expect.poll(() => rail.textContent()).toContain("may have saved and has not been retried");
	expect(await draft.inputValue()).toBe("Keep this separate next request.");
	const calls = readFileSync(join(directory, "provider-calls.jsonl"), "utf8");
	await f.page.reload();
	await expect.poll(() => rail.textContent()).toContain("may have saved and has not been retried");
	expect(await draft.inputValue()).toBe("Keep this separate next request.");
	expect(readFileSync(join(directory, "provider-calls.jsonl"), "utf8")).toBe(calls);
	expect(readFileSync(f.file, "utf8")).toContain("Agent body");
	client.source = supervisor;
	await send("Agent body", "Explicit retry");
	await expect.poll(() => readFileSync(f.file, "utf8"), { timeout: 20_000 }).toContain("Explicit retry");
	await expect.poll(() => f.frame.locator("#body").textContent()).toBe("Explicit retry");
});

it("retains a secondary bundled edit through shared source save and inverse", { timeout: 180000 }, async () => {
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
	const shared = 'export function Label(){return <h1 id="label">Shared before</h1>}';
	const consumer =
		'import {Label} from "shared/label";export default function Frame(){return <main style={{padding:40}}><Label/><p id="body">Original body</p><input id="draft" defaultValue="keep"/></main>}';
	const f = await served(consumer, client, directory, (root) => {
		writeDesignFile(root, "shared/label.tsx", shared);
		writeFrame(root, "second", consumer);
		writeDesignFile(root, "frames/home/frame.json", '{"x":0,"y":0,"w":450,"h":400}');
		writeDesignFile(root, "frames/second/frame.json", '{"x":500,"y":0,"w":450,"h":400}');
	});
	const second = f.page.frameLocator('iframe[title="second"]');
	await second.locator("#label").waitFor();
	for (const frame of [f.frame, second]) {
		await frame.locator("#draft").fill("independent native");
		await frame.locator("#draft").evaluate((el) => Reflect.set(window, "keptInput", el));
	}
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Shared after");
	await expect.poll(() => second.locator("#label").textContent()).toBe("Shared after");
	const file = join(f.project.root, "design/frames/second/frame.tsx");
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
						{ name: "read", arguments: { path: file } },
						{
							name: "edit",
							arguments: { path: file, edits: [{ oldText: "Original body", newText: "Agent body" }] },
						},
					])}`,
				},
			],
		}),
	});
	expect(response.ok).toBe(true);
	await response.text();
	expect(readFileSync(file, "utf8")).toContain("Agent body");
	await f.page.keyboard.press("Enter");
	for (let phase = 0; phase < 3; phase++) {
		if (phase) {
			await f.page.mouse.click(5, 5);
			await f.page.keyboard.press(phase === 1 ? "ControlOrMeta+z" : "ControlOrMeta+Shift+z");
		}
		const text = phase === 1 ? "Shared before" : "Shared after";
		await expect.poll(() => readFileSync(join(f.project.root, "design/shared/label.tsx"), "utf8")).toContain(text);
		for (const frame of [f.frame, second]) {
			await expect.poll(() => frame.locator("#label").textContent()).toBe(text);
			expect(await frame.locator("#draft").inputValue()).toBe("independent native");
			expect(await frame.locator("#draft").evaluate((el) => el === Reflect.get(window, "keptInput"))).toBe(true);
		}
		await expect.poll(() => second.locator("#body").textContent()).toBe("Agent body");
		expect(readFileSync(file, "utf8")).toContain("Agent body");
		await expect.poll(() => f.page.locator("[data-hand-notice]").count()).toBe(0);
	}
});
