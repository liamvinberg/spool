import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, chromium, type ElectronApplication } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { closeBundledSandbox, sandboxCommand } from "./daemon/bundled-sandbox";
import { makeTempDir, writeDesignFile, writeFrame } from "./test-helpers";

const repo = fileURLToPath(new URL("..", import.meta.url));
const appPath = process.env.SPOOL_TEST_APP;
const restricted = process.env.SPOOL_TEST_RESTRICTED === "1";
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
async function freePort(): Promise<number> {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing port");
	await new Promise<void>((resolve) => server.close(() => resolve()));
	return address.port;
}
function childHost(pid: number): number | undefined {
	const output = spawnSync("ps", ["-axo", "pid=,ppid=,args="], { encoding: "utf8" }).stdout;
	return output.split("\n").flatMap((line) => {
		const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
		return match && Number(match[2]) === pid && match[3]?.includes("bundled-host.js") ? [Number(match[1])] : [];
	})[0];
}
/** A debugger changes only HTTP responses in this isolated host, never package files. */
async function attachTransport(pid: number) {
	const occupied = await fetch("http://127.0.0.1:9229/json/list").then(
		() => true,
		() => false,
	);
	if (occupied) throw new Error("Inspector port 9229 is occupied; leave that process untouched");
	process.kill(pid, "SIGUSR1");
	let endpoint = "";
	await expect
		.poll(
			async () => {
				try {
					const targets = (await fetch("http://127.0.0.1:9229/json/list").then((response) => response.json())) as {
						webSocketDebuggerUrl: string;
					}[];
					endpoint = targets[0]?.webSocketDebuggerUrl ?? "";
					return endpoint !== "";
				} catch {
					return false;
				}
			},
			{ timeout: 10_000 },
		)
		.toBe(true);
	const socket = new WebSocket(endpoint);
	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = reject;
	});
	const evaluate = (expression: string): Promise<unknown> =>
		new Promise((resolve, reject) => {
			socket.onmessage = (event) => {
				const response = JSON.parse(String(event.data)) as {
					id?: number;
					result?: { exceptionDetails?: unknown; result?: { value?: unknown } };
					error?: unknown;
				};
				if (response.id !== 1) return;
				if (response.error || response.result?.exceptionDetails) reject(new Error(JSON.stringify(response)));
				else resolve(response.result?.result?.value);
			};
			socket.send(
				JSON.stringify({
					id: 1,
					method: "Runtime.evaluate",
					params: { expression, awaitPromise: false, returnByValue: true },
				}),
			);
		});
	try {
		const evidence = await evaluate(readFileSync(join(repo, "src/fixtures/installed-provider.js"), "utf8"));
		expect(evidence).toMatchObject({ pid });
		return evidence;
	} finally {
		await new Promise<void>((resolve) => {
			socket.onclose = () => resolve();
			socket.close();
		});
	}
}

it("completes a deterministic journey through the clean installed host and delivered CLI", {
	timeout: 300_000,
}, async () => {
	if (restricted) {
		expect(process.platform).toBe("linux");
		try {
			await expect(
				sandboxCommand(
					"true",
					makeTempDir(),
					{ allowWrite: [], denyRead: [], denyWrite: [] },
					new AbortController().signal,
				).then((prepared) => {
					prepared.cleanup();
					return prepared;
				}),
			).rejects.toMatchObject({
				message: "Command isolation is unavailable (probe execution)",
				cause: { message: expect.stringMatching(/bwrap: loopback:.*Operation not permitted/) },
			});
		} finally {
			await closeBundledSandbox();
		}
	}
	const evidence: Record<string, unknown> = {
		journeyComplete: false,
		platform: process.platform,
		arch: process.arch,
		node: process.version,
		restricted,
	};
	const prefix = makeTempDir();
	const claudeConfig = join(prefix, ".claude");
	mkdirSync(claudeConfig);
	writeFileSync(join(claudeConfig, "settings.json"), '{"fixture":"preserve this configuration"}');
	const state = join(makeTempDir(), "instance");
	mkdirSync(state);
	const project = realpathSync(makeTempDir());
	const decoys = join(prefix, "decoys");
	mkdirSync(decoys);
	for (const name of ["spool", "pi", "codex", "opencode", "claude"])
		writeFileSync(join(decoys, name), `#!/bin/sh\nprintf '${name}\\n' >> '${prefix}/unexpected-harness'\nexit 71\n`, {
			mode: 0o755,
		});
	const port = await freePort();
	const env = {
		PATH: `${decoys}:${process.env.PATH ?? ""}`,
		SHELL: "/bin/false",
		HOME: prefix,
		TMPDIR: process.env.TMPDIR ?? "/tmp",
		SPOOL_DIR: state,
		SPOOL_PORT: String(port),
	};
	const run = (command: string, args: string[], cwd = project, extra: NodeJS.ProcessEnv = {}) => {
		const result = spawnSync(command, args, { cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 180_000 });
		expect(result.status, `${command} ${args.join(" ")}\n${result.stderr}`).toBe(0);
		return result.stdout.trim();
	};
	let install: string;
	if (appPath) {
		install = realpathSync(join(appPath, "Contents/Resources/cli/spool/node_modules/spool.page"));
	} else {
		const tarball = process.env.SPOOL_TEST_TARBALL ?? join(prefix, "spool.tgz");
		if (!process.env.SPOOL_TEST_TARBALL) run("pnpm", ["pack", "--out", tarball], repo, { HOME: process.env.HOME });
		writeFileSync(join(prefix, "package.json"), '{"private":true}\n');
		run("npm", ["install", "--prefix", prefix, "--omit=dev", "--no-audit", "--no-fund", tarball], prefix);
		install = realpathSync(join(prefix, "node_modules/spool.page"));
	}
	const manifest = JSON.parse(readFileSync(join(install, "package.json"), "utf8")) as {
		dependencies: Record<string, string>;
	};
	for (const [name, version] of Object.entries({
		"@earendil-works/pi-ai": "0.85.1",
		"@earendil-works/pi-agent-core": "0.85.1",
		"@earendil-works/pi-coding-agent": "0.85.1",
		"@anthropic-ai/sandbox-runtime": "0.0.75",
		typebox: "1.3.7",
	}))
		expect(manifest.dependencies[name]).toBe(version);
	for (const asset of [
		"dist/cli.js",
		"dist/bundled-host.js",
		"dist/bundled-oauth-native.js",
		"dist/bundled-command-process.js",
		"dist/ui/index.html",
		"dist/frame-runtime.js",
		"dist/spool-public.d.ts",
		"LICENSE.md",
		"THIRD_PARTY_NOTICES.md",
	])
		expect(existsSync(join(install, asset)), asset).toBe(true);
	for (const face of ["latin-wght-normal", "latin-wght-italic", "latin-ext-wght-normal", "latin-ext-wght-italic"])
		expect(
			readdirSync(join(install, "dist/ui/assets")).some(
				(asset) => asset.startsWith(`instrument-sans-${face}-`) && asset.endsWith(".woff2"),
			),
			face,
		).toBe(true);
	const requireFromInstall = createRequire(join(install, "package.json"));
	const packageRoot = (name: string) => {
		const directory = requireFromInstall.resolve
			.paths(name)
			?.map((path) => join(path, name))
			.find((path) => existsSync(join(path, "package.json")));
		if (!directory) throw new Error(`Missing installed ${name}`);
		return realpathSync(directory);
	};
	const sandbox = packageRoot("@anthropic-ai/sandbox-runtime");
	for (const asset of [
		"LICENSE",
		"vendor/java-proxy-agent/srt-proxy-agent.jar",
		`vendor/seccomp/${process.arch}/apply-seccomp`,
	])
		expect(existsSync(join(sandbox, asset)), asset).toBe(true);
	expect(readFileSync(join(install, "THIRD_PARTY_NOTICES.md"), "utf8")).toContain("Copyright (c) 2025 Mario Zechner");
	expect(readFileSync(join(install, "THIRD_PARTY_NOTICES.md"), "utf8")).toContain("Instrument Sans Project Authors");
	expect(readFileSync(join(packageRoot("typebox"), "license"), "utf8")).toContain("Haydn Paterson");
	const pinnedPaths = [
		join(install, "dist/cli.js"),
		join(install, "dist/bundled-host.js"),
		join(install, "dist/bundled-oauth-native.js"),
		join(install, "dist/bundled-command-process.js"),
		...Object.keys(manifest.dependencies)
			.filter((name) => name.includes("pi-") || name.includes("sandbox-runtime") || name === "typebox")
			.map((name) => join(packageRoot(name), "package.json")),
	];
	const installedHashes = () =>
		Object.fromEntries(
			pinnedPaths.map((path) => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]),
		);
	const beforeHashes = installedHashes();
	const bundled = join(state, "bundled");
	mkdirSync(bundled);
	const cachedModel = {
		id: "installed-cached",
		name: "Installed cached model",
		provider: "openai",
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
		reasoning: true,
		input: ["text", "image"],
		contextWindow: 100000,
		maxTokens: 4096,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};
	writeFileSync(
		join(bundled, "models-openai.json"),
		JSON.stringify({
			lastModified: Date.parse("2099-01-01"),
			checkedAt: Date.now(),
			models: [
				cachedModel,
				{ ...cachedModel, id: "rejected-endpoint", name: "Rejected endpoint", baseUrl: "http://127.0.0.1:1" },
			],
		}),
	);
	const cli = join(install, "dist/cli.js");
	const executable = appPath ? join(appPath, "Contents/MacOS/Spool") : process.execPath;
	const cliRun = (args: string[]) =>
		run(executable, [cli, ...args], project, appPath ? { ELECTRON_RUN_AS_NODE: "1" } : {});
	cliRun(["init", project]);
	writeFrame(
		project,
		"home",
		'export default () => <main><h1>Original</h1><button data-go="next">Continue</button></main>',
	);
	writeDesignFile(project, "frames/home/frame.json", '{"w":600,"h":900}');
	writeFrame(project, "next", "export default () => <h1>Arrived</h1>");
	writeFrame(project, "error", 'console.error("installed runtime log"); export default () => <h1>Log</h1>');
	writeFileSync(join(state, "config.json"), JSON.stringify({ port, updateCheck: false }));
	let daemonChild: ChildProcess | undefined;
	let electron: ElectronApplication | undefined;
	if (appPath) electron = await _electron.launch({ executablePath: executable, env, timeout: 30_000 });
	else daemonChild = spawn(executable, [cli, "serve", "--foreground"], { cwd: project, env, stdio: "ignore" });
	let daemonPid = 0;
	let hostPid = 0;
	let activeCommandPid = 0;
	onTestFinished(async () => {
		if (activeCommandPid && alive(activeCommandPid)) process.kill(activeCommandPid, "SIGKILL");
		if (activeCommandPid) await expect.poll(() => alive(activeCommandPid), { timeout: 15_000 }).toBe(false);
		await electron?.close();
		daemonChild?.kill("SIGTERM");
		if (daemonPid) await expect.poll(() => alive(daemonPid), { timeout: 15_000 }).toBe(false);
		if (hostPid) await expect.poll(() => alive(hostPid), { timeout: 15_000 }).toBe(false);
		evidence.daemonStopped = true;
		evidence.hostStopped = true;
		if (process.env.SPOOL_TEST_EVIDENCE_DIR) {
			mkdirSync(process.env.SPOOL_TEST_EVIDENCE_DIR, { recursive: true });
			writeFileSync(
				join(
					process.env.SPOOL_TEST_EVIDENCE_DIR,
					restricted ? "installed-restricted.json" : appPath ? "installed-app.json" : "installed-npm.json",
				),
				JSON.stringify(evidence, null, 2),
			);
		}
	});
	const url = `http://127.0.0.1:${port}`;
	await expect
		.poll(
			async () =>
				fetch(`${url}/api/health`).then(
					(response) => response.ok,
					() => false,
				),
			{ timeout: 30_000 },
		)
		.toBe(true);
	const daemon = JSON.parse(readFileSync(join(state, "daemon.json"), "utf8")) as { pid: number; controlToken: string };
	daemonPid = daemon.pid;
	const browser = electron ? undefined : await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser?.close());
	const page = electron
		? await electron.firstWindow()
		: await browser?.newPage({ viewport: { width: 1400, height: 900 } });
	if (!page) throw new Error("Missing delivered canvas");
	let observedPage = page;
	if (electron) await page.waitForURL((address) => address.protocol === "http:", { timeout: 30_000 });
	await page.goto(`${url}/p/${basename(project)}`);
	onTestFinished(async () => {
		if (!observedPage.isClosed())
			console.info(
				"last canvas",
				observedPage.url(),
				(await observedPage.locator("body").textContent())?.slice(0, 1200),
			);
	});
	await page.locator('[data-dock-glyph="agent"]').click();
	await expect.poll(() => childHost(daemonPid), { timeout: 15_000 }).toBeDefined();
	hostPid = childHost(daemonPid) ?? 0;
	const runtime = await attachTransport(hostPid);
	if (appPath) expect(runtime).toMatchObject({ executable: realpathSync(executable), electron: "43.4.1" });
	const rail = page.locator("[data-agent-rail]");
	const field = rail.locator("textarea");
	await field.fill("retain canceled draft");
	await field.press("Enter");
	const dialog = page.getByRole("dialog", { name: "Connect an account" });
	await dialog.getByRole("menuitem", { name: "OpenAI API key", exact: true }).click();
	await dialog.locator("input").fill("discarded-fixture-key");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect.poll(() => dialog.textContent()).toContain("Sign-in canceled");
	await dialog.getByRole("button", { name: "Try again" }).click();
	await dialog.locator("input").fill("installed-fixture-key");
	await dialog.getByRole("button", { name: "Connect", exact: true }).click();
	await expect.poll(() => dialog.textContent()).toContain("OpenAI connected");
	await dialog.getByRole("button", { name: "Done", exact: true }).click();
	expect(await field.inputValue()).toBe("retain canceled draft");
	await rail.getByRole("button", { name: "Choose model" }).click();
	await page.getByRole("button", { name: "Find a model…", exact: true }).click();
	await page.locator('[data-agent-model-row="Installed cached model"]').waitFor();
	expect(await page.locator('[data-agent-model-row="Rejected endpoint"]').count()).toBe(0);
	await page.locator('[data-agent-model-row="Installed cached model"]').click();
	await page.locator('[data-frame-label="home"]').click();
	await page.locator('[data-agent-chip="home"]').waitFor();
	const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
	await field.evaluate((element, data) => {
		const transfer = new DataTransfer();
		transfer.items.add(
			new File([Uint8Array.from(atob(data), (character) => character.charCodeAt(0))], "reference.png", {
				type: "image/png",
			}),
		);
		element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
	}, png);
	const send = async (tools: { name: string; arguments: Record<string, unknown> }[]) => {
		await field.fill(`installed tools: ${JSON.stringify(tools)}`);
		await field.press("Enter");
	};
	const settled = async () => {
		await expect.poll(() => page.getByRole("button", { name: /stop.*⎋/ }).count(), { timeout: 60_000 }).toBe(0);
	};
	const bash = (command: string, extra: Record<string, unknown> = {}) => ({
		name: "bash",
		arguments: { command, ...extra },
	});
	const open = page.locator('[data-agent-ask="open"]');
	await send([
		{ name: "read", arguments: { path: "design/frames/home/frame.tsx" } },
		{
			name: "edit",
			arguments: {
				path: "design/frames/home/frame.tsx",
				edits: [{ oldText: "Original", newText: "Edited installed frame" }],
			},
		},
		bash("spool shot home"),
		bash("spool logs error"),
		bash("spool skill verbs"),
		bash("spool selection"),
		bash("spool status"),
		{
			name: "write",
			arguments: {
				path: "design/frames/authored/frame.tsx",
				content: "export default () => <h1>Authored by the installed host</h1>",
			},
		},
		...(!restricted ? [bash("printf quiet > design/quiet"), bash("printf forbidden > outside-quiet")] : []),
	]);
	await expect
		.poll(() => readFileSync(join(project, "design/frames/home/frame.tsx"), "utf8"), { timeout: 30_000 })
		.toContain("Edited installed frame");
	await settled();
	expect(await open.count()).toBe(0);
	await expect.poll(() => rail.locator('img[src^="data:image/png"]').count()).toBeGreaterThan(0);
	expect(await rail.textContent()).toContain("Installed journey complete.");
	const callsFile = join(state, "bundled/installed-http.jsonl");
	const calls = () => readFileSync(callsFile, "utf8");
	expect(calls()).toContain("installed runtime log");
	expect(calls()).toContain(png);
	expect(calls()).toContain("<selection>");
	expect(calls()).toContain(install);
	expect(readFileSync(join(project, "design/frames/authored/frame.tsx"), "utf8")).toContain(
		"Authored by the installed host",
	);
	if (!restricted) {
		expect(readFileSync(join(project, "design/quiet"), "utf8")).toBe("quiet");
		expect(existsSync(join(project, "outside-quiet"))).toBe(false);
	}
	const opened = electron ? electron.waitForEvent("window") : page.waitForEvent("popup");
	await page.evaluate(
		(address) => {
			window.open(address, "_blank");
		},
		cliRun(["url", "home"]),
	);
	const player = await opened;
	await player.frameLocator("#spool-player").getByRole("heading", { name: "Edited installed frame" }).waitFor();
	await player.frameLocator("#spool-player").getByRole("button", { name: "Continue" }).click();
	await player.frameLocator("#spool-player").getByRole("heading", { name: "Arrived" }).waitFor();
	await player.close();
	const browserCheck = `import { createRequire } from "node:module";
const requireFromSpool = createRequire(${JSON.stringify(join(install, "package.json"))});
const { chromium } = requireFromSpool("playwright-core");
const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
try {
 const page = await browser.newPage();
 await page.goto(${JSON.stringify(cliRun(["url", "home"]))});
 const frame = page.frameLocator("#spool-player");
 await frame.getByRole("heading", { name: "Edited installed frame" }).waitFor();
 await frame.getByRole("button", { name: "Continue" }).click();
 await frame.getByRole("heading", { name: "Arrived" }).waitFor();
 console.log("installed Playwright inspected and played the frame");
} finally { await browser.close(); }
`;
	await send([
		{ name: "write", arguments: { path: "design/check.mjs", content: browserCheck } },
		bash(`${appPath ? "ELECTRON_RUN_AS_NODE=1 " : ""}'${executable}' design/check.mjs`, { unsandboxed: true }),
	]);
	await open.waitFor();
	await open.getByRole("button", { name: "allow once", exact: true }).click();
	await settled();
	const outputs = calls()
		.trim()
		.split("\n")
		.flatMap((line) => {
			const request = JSON.parse(line) as { input: { type?: string; output?: unknown }[] };
			return request.input
				.filter((item) => item.type === "function_call_output")
				.map((item) => JSON.stringify(item.output));
		})
		.join("\n");
	expect(outputs).toContain("installed Playwright inspected and played the frame");
	await send([bash("printf denied > denied", { unsandboxed: !restricted })]);
	await open.waitFor();
	expect(existsSync(join(project, "denied"))).toBe(false);
	if (restricted) expect(await open.textContent()).toContain("can’t restrict commands to design/");
	await open.getByRole("button", { name: "deny", exact: true }).click();
	await settled();
	expect(existsSync(join(project, "denied"))).toBe(false);
	await send([bash("printf stopped > stopped", { unsandboxed: !restricted })]);
	await open.waitFor();
	await page.getByRole("button", { name: /stop.*⎋/ }).click();
	await settled();
	expect(existsSync(join(project, "stopped"))).toBe(false);
	await send([bash("printf once >> once", { unsandboxed: !restricted })]);
	await open.waitFor();
	expect(existsSync(join(project, "once"))).toBe(false);
	await open.getByRole("button", { name: "allow once", exact: true }).click();
	await settled();
	expect(readFileSync(join(project, "once"), "utf8")).toBe("once");
	await send([bash("printf grant > grant", { unsandboxed: !restricted })]);
	await open.waitFor();
	await open.getByRole("button", { name: "for this thread", exact: true }).click();
	await settled();
	await send([bash("printf reused > reused")]);
	await expect.poll(() => existsSync(join(project, "reused"))).toBe(true);
	await settled();
	expect(await open.count()).toBe(0);
	await send([{ name: "write", arguments: { path: "outside.txt", content: "approved file" } }]);
	await open.waitFor();
	expect(existsSync(join(project, "outside.txt"))).toBe(false);
	await open.getByRole("button", { name: "for this thread", exact: true }).click();
	await settled();
	await send([{ name: "write", arguments: { path: "outside.txt", content: "reused file grant" } }]);
	await expect.poll(() => readFileSync(join(project, "outside.txt"), "utf8")).toBe("reused file grant");
	await settled();
	expect(await open.count()).toBe(0);
	const question = {
		name: "ask_person",
		arguments: {
			questions: [
				{
					header: "Layout",
					question: "Where should the heading go?",
					options: [
						{ label: "Above", description: "Put it first." },
						{ label: "Below", description: "Put it last." },
					],
				},
			],
		},
	};
	await send([question]);
	await open.getByRole("button", { name: "Above Put it first.", exact: true }).click();
	await settled();
	await send([question]);
	await open.waitFor();
	await field.fill("Put it beside the image.");
	await field.press("Enter");
	await settled();
	expect(calls()).toContain("Put it beside the image.");
	// A fresh conversation inherits no runtime grants. Opening its menu grants nothing.
	await rail.getByRole("button", { name: "New chat", exact: true }).click();
	await send([bash("printf bypass > bypass", { unsandboxed: true })]);
	await open.waitFor();
	await rail.locator("[data-permission-trigger]").click();
	expect(existsSync(join(project, "bypass"))).toBe(false);
	await rail
		.getByRole("menu", { name: "Agent permissions" })
		.getByRole("menuitemradio", { name: "bypass", exact: true })
		.click();
	await expect.poll(() => existsSync(join(project, "bypass"))).toBe(true);
	await settled();
	await send([
		bash("spool logs home && spool url home"),
		bash("spool open ."),
		bash("env spool status"),
		bash("bash -c 'spool status'"),
		bash("printf kept > permitted-before-refusal; spool status"),
	]);
	await settled();
	expect(calls()).toContain("one Spool command per tool call");
	expect(existsSync(join(prefix, "unexpected-harness"))).toBe(false);
	expect(readFileSync(join(project, "permitted-before-refusal"), "utf8")).toBe("kept");
	expect(await open.count()).toBe(0);
	await send([question]);
	await open.waitFor();
	await page.getByRole("button", { name: /stop.*⎋/ }).click();
	await settled();
	// A host crash retires an active model response without repeating a completed command.
	await field.fill(`hold installed turn\ninstalled tools: ${JSON.stringify([bash("printf effect >> crash-effect")])}`);
	await field.press("Enter");
	await expect.poll(() => existsSync(join(project, "crash-effect"))).toBe(true);
	await expect
		.poll(
			() =>
				calls()
					.split("\n")
					.filter((line) => line.includes("function_call_output") && line.includes("crash-effect")).length,
		)
		.toBeGreaterThan(0);
	process.kill(hostPid, "SIGKILL");
	await settled();
	expect(readFileSync(join(project, "crash-effect"), "utf8")).toBe("effect");
	const beforeRestart = calls();
	await page.reload();
	await expect.poll(() => childHost(daemonPid), { timeout: 15_000 }).toBeDefined();
	hostPid = childHost(daemonPid) ?? 0;
	await attachTransport(hostPid);
	expect(calls()).toBe(beforeRestart);
	await rail.getByRole("button", { name: "Choose model" }).click();
	await page.getByRole("button", { name: "Find a model…", exact: true }).click();
	await page.locator('[data-agent-model-row="Installed cached model"]').waitFor();
	await page.keyboard.press("Escape");
	await field.fill("Continue after the stopped host.");
	await field.press("Enter");
	await expect.poll(() => calls(), { timeout: 15_000 }).not.toBe(beforeRestart);
	await settled();
	expect(await field.inputValue()).toBe("");
	expect(readFileSync(join(project, "crash-effect"), "utf8")).toBe("effect");
	// A command still executing when its host dies must retire, not merely lose its rail row.
	await send([
		{
			name: "write",
			arguments: {
				path: "design/active-command.mjs",
				content:
					'import { writeFileSync, appendFileSync } from "node:fs"; writeFileSync("design/active-pid", String(process.pid)); setInterval(() => appendFileSync("design/active-ticks", "x"), 30);',
			},
		},
	]);
	await settled();
	await send([bash(`${appPath ? "ELECTRON_RUN_AS_NODE=1 " : ""}'${executable}' design/active-command.mjs`)]);
	await expect
		.poll(() =>
			existsSync(join(project, "design/active-pid"))
				? Number(readFileSync(join(project, "design/active-pid"), "utf8"))
				: 0,
		)
		.toBeGreaterThan(1);
	activeCommandPid = Number(readFileSync(join(project, "design/active-pid"), "utf8"));
	expect(alive(activeCommandPid)).toBe(true);
	await expect
		.poll(() =>
			existsSync(join(project, "design/active-ticks"))
				? readFileSync(join(project, "design/active-ticks"), "utf8").length
				: 0,
		)
		.toBeGreaterThan(0);
	process.kill(hostPid, "SIGKILL");
	await settled();
	await expect.poll(() => alive(activeCommandPid), { timeout: 15_000 }).toBe(false);
	const stoppedTicks = readFileSync(join(project, "design/active-ticks"), "utf8");
	const beforeActiveRestart = calls();
	await page.reload();
	await expect.poll(() => childHost(daemonPid), { timeout: 15_000 }).toBeDefined();
	hostPid = childHost(daemonPid) ?? 0;
	await attachTransport(hostPid);
	expect(calls()).toBe(beforeActiveRestart);
	expect(readFileSync(join(project, "design/active-ticks"), "utf8")).toBe(stoppedTicks);
	evidence.activeCommand = { pid: activeCommandPid, stopped: true, replayed: false };
	// Refresh model data through the native catalog HTTP parser without replacing code.
	const headers = { "Content-Type": "application/json", "X-Spool-Control": daemon.controlToken };
	const account = async (operation: unknown) => {
		const response = await fetch(`${url}/api/p/${basename(project)}/agent/account`, {
			method: "POST",
			headers,
			body: JSON.stringify(operation),
		});
		expect(response.ok).toBe(true);
		return response.json() as Promise<{ id: string; kind: string }>;
	};
	const threadsBefore = (await fetch(`${url}/api/p/${basename(project)}/agent/threads`, { headers }).then((response) =>
		response.json(),
	)) as { threads: { id: string }[] };
	const modelUrl = `${url}/api/p/${basename(project)}/agent/threads/${threadsBefore.threads[0]?.id}/models`;
	await account({ action: "disconnect", provider: "openai" });
	await fetch(modelUrl, { headers });
	writeFileSync(
		join(bundled, "installed-catalog-response.json"),
		JSON.stringify([
			{ ...cachedModel, id: "installed-refreshed", name: "Installed refreshed model" },
			{ ...cachedModel, id: "rejected-refresh-endpoint", baseUrl: "http://127.0.0.1:1" },
		]),
	);
	const catalogPath = join(bundled, "models-openai.json");
	writeFileSync(catalogPath, JSON.stringify({ ...JSON.parse(readFileSync(catalogPath, "utf8")), checkedAt: 0 }));
	const renewal = await account({ action: "start", provider: "openai", method: "api_key" });
	expect((await account({ action: "input", id: renewal.id, value: "renewed-fixture-key" })).kind).toBe("connected");
	await expect
		.poll(async () => JSON.stringify(await fetch(modelUrl, { headers }).then((response) => response.json())), {
			timeout: 15_000,
		})
		.toContain("Installed refreshed model");
	expect(readFileSync(catalogPath, "utf8")).not.toContain("rejected-refresh-endpoint");
	// Read a pre-engine Claude record through the installed daemon without its session.
	const legacyId = randomUUID();
	const legacyDirectory = join(state, "threads", createHash("sha256").update(project).digest("hex").slice(0, 16));
	mkdirSync(legacyDirectory, { recursive: true });
	const legacy = {
		id: legacyId,
		ask: "Legacy Claude history",
		stopped: false,
		closed: false,
		life: "read",
		at: 1234,
		entries: [{ kind: "user", text: "Legacy request" }],
		kept: 1,
		plan: null,
		queued: [{ prompt: "Legacy queue", selection: [] }],
		draft: "Legacy draft",
	};
	writeFileSync(join(legacyDirectory, `${legacyId}.json`), JSON.stringify(legacy));
	const histories = (await fetch(`${url}/api/p/${basename(project)}/agent/threads`, {
		headers: { "X-Spool-Control": daemon.controlToken },
	}).then((response) => response.json())) as { threads: unknown[] };
	expect(histories.threads).toContainEqual(
		expect.objectContaining({ ...legacy, engine: "claude", session: { id: legacyId }, continuable: false }),
	);
	expect(readFileSync(join(claudeConfig, "settings.json"), "utf8")).toBe('{"fixture":"preserve this configuration"}');
	expect(existsSync(join(prefix, "unexpected-harness"))).toBe(false);
	expect(installedHashes()).toEqual(beforeHashes);
	// Reopening this installation retires its old children and reads saved work without replay.
	const previousDaemon = daemonPid;
	const previousHost = hostPid;
	const beforeReopen = calls();
	expect(alive(previousDaemon)).toBe(true);
	expect(alive(previousHost)).toBe(true);
	await electron?.close();
	daemonChild?.kill("SIGTERM");
	await expect.poll(() => alive(previousDaemon), { timeout: 15_000 }).toBe(false);
	await expect.poll(() => alive(previousHost), { timeout: 15_000 }).toBe(false);
	if (appPath) electron = await _electron.launch({ executablePath: executable, env, timeout: 30_000 });
	else daemonChild = spawn(executable, [cli, "serve", "--foreground"], { cwd: project, env, stdio: "ignore" });
	await expect
		.poll(
			async () =>
				fetch(`${url}/api/health`).then(
					(response) => response.ok,
					() => false,
				),
			{ timeout: 30_000 },
		)
		.toBe(true);
	daemonPid = (JSON.parse(readFileSync(join(state, "daemon.json"), "utf8")) as { pid: number }).pid;
	expect(daemonPid).not.toBe(previousDaemon);
	const reopened = electron ? await electron.firstWindow() : await browser?.newPage();
	if (!reopened) throw new Error("Missing reopened installed canvas");
	observedPage = reopened;
	if (electron) await reopened.waitForURL((address) => address.protocol === "http:", { timeout: 30_000 });
	await reopened.goto(`${url}/p/${basename(project)}`);
	const agentGlyph = reopened.locator('[data-dock-glyph="agent"]');
	await agentGlyph.waitFor();
	const dockWasOpen = (await agentGlyph.getAttribute("aria-pressed")) === "true";
	// Electron restores this profile's dock state; a fresh browser context does not.
	if (electron) expect(dockWasOpen).toBe(true);
	if (!dockWasOpen) await agentGlyph.click();
	await expect.poll(() => childHost(daemonPid), { timeout: 15_000 }).toBeDefined();
	hostPid = childHost(daemonPid) ?? 0;
	expect(hostPid).not.toBe(previousHost);
	const reopenedRuntime = await attachTransport(hostPid);
	if (appPath) expect(reopenedRuntime).toMatchObject({ executable: realpathSync(executable), electron: "43.4.1" });
	await reopened.locator("[data-agent-rail]").getByRole("button", { name: "Choose model" }).click();
	await reopened.getByRole("button", { name: "Find a model…", exact: true }).click();
	await reopened.locator('[data-agent-model-row="Installed refreshed model"]').waitFor();
	await reopened.keyboard.press("Escape");
	expect(calls()).toBe(beforeReopen);
	expect(readFileSync(join(project, "crash-effect"), "utf8")).toBe("effect");
	expect(readFileSync(join(project, "outside.txt"), "utf8")).toBe("reused file grant");
	expect(readFileSync(join(claudeConfig, "settings.json"), "utf8")).toBe('{"fixture":"preserve this configuration"}');
	expect(existsSync(join(prefix, "unexpected-harness"))).toBe(false);
	evidence.reopen = { previousDaemon, previousHost, daemonPid, hostPid, dockWasOpen, runtime: reopenedRuntime };
	if (process.env.SPOOL_TEST_SHOTS) {
		mkdirSync(process.env.SPOOL_TEST_SHOTS, { recursive: true });
		await reopened.screenshot({
			path: join(process.env.SPOOL_TEST_SHOTS, appPath ? "installed-app.png" : "installed-npm.png"),
		});
	}
	Object.assign(evidence, {
		journeyComplete: true,
		installation: install,
		runtime,
		hashes: beforeHashes,
		daemonPid,
		hostPid,
	});
	console.info(
		JSON.stringify({
			installation: install,
			runtime,
			platform: process.platform,
			arch: process.arch,
			node: process.version,
			daemonPid,
			hostPid,
			restricted,
		}),
	);
});
