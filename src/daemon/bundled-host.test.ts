import { type ChildProcess, execFileSync, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import type { AgentEvent } from "./agent-events";
import { serveDaemon } from "./server";

it("starts one lazy real host, stops on host failure and reopens the exact saved session", {
	timeout: 30_000,
}, async () => {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "pipe", "ipc"],
		});
		children.push(child);
		return child;
	});
	onTestFinished(async () => {
		await Promise.all(
			children
				.filter((child) => child.exitCode === null && child.signalCode === null)
				.map(async (child) => {
					const exited = once(child, "exit");
					child.kill();
					await exited;
				}),
		);
	});
	const engine = createSpoolEngine(directory, client);
	expect(children).toHaveLength(0);
	if (engine.authentication.kind !== "managed") throw new Error("Expected managed auth");
	const step = await engine.authentication.start("openai", "api_key");
	if (step.kind !== "step") throw new Error("Expected key input");
	expect(await engine.authentication.input(step.id, "fixture-key")).toEqual({ kind: "connected" });
	expect(children).toHaveLength(1);
	const options = {
		root: makeTempDir(),
		session: { id: randomUUID() },
		said: [{ prompt: "hello", selection: "selection one" }],
		ask: { value: "spool/openai/api_key/spool-test" },
		permissions: "ask" as const,
	};
	const first: AgentEvent[] = [];
	for await (const event of engine.start(options).events) first.push(event);
	expect(first.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	const second = engine.start({ ...options, said: [{ prompt: "hold this turn", selection: "selection two" }] });
	const secondEvents: AgentEvent[] = [];
	const read = (async () => {
		for await (const event of second.events) secondEvents.push(event);
	})();
	await expect.poll(() => secondEvents.some((event) => event.kind === "say")).toBe(true);
	children[0]?.kill("SIGKILL");
	await read;
	expect(secondEvents.at(-1)).toMatchObject({ kind: "closed", code: 1 });
	expect(await engine.continuable(options.root, options.session)).toBe(true);
	const third: AgentEvent[] = [];
	for await (const event of engine.start({ ...options, said: [{ prompt: "resume", selection: "selection three" }] })
		.events)
		third.push(event);
	expect(children).toHaveLength(2);
	expect(third.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	const calls = readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n");
	expect(calls).toHaveLength(3);
	expect(calls[2]).toContain("selection one");
	expect(calls[2]).toContain("selection two");
	expect(calls[2]).toContain("selection three");
});

it("finishes the bundled state writer before daemon shutdown releases its directory", { timeout: 20_000 }, async () => {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(join(directory, "bundled"), (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		children.push(child);
		return child;
	});
	onTestFinished(async () => {
		for (const child of children) {
			if (child.exitCode !== null || child.signalCode !== null) continue;
			const exited = once(child, "exit");
			child.kill();
			await exited;
		}
	});
	const engine = createSpoolEngine(directory, client);
	const daemon = await serveDaemon({
		spoolDir: directory,
		version: "test",
		host: "127.0.0.1",
		port: 0,
		history: false,
		agentEngines: [engine],
	});
	onTestFinished(() => daemon.close());
	// Closing while the lazy account request boots must also await its state writer.
	const account = engine.account(makeTempDir()).catch((error: unknown) => error);
	await daemon.close();
	expect(children).toHaveLength(1);
	expect(children[0]?.exitCode).toBe(0);
	await account;
	await expect(engine.account(directory)).rejects.toThrow("The bundled engine is closed.");
	expect(children).toHaveLength(1);
});

it("does not pass ambient accounts, executable settings or provider variables to the host", {
	timeout: 20_000,
}, async () => {
	const environment = bundledEnvironment(makeTempDir());
	for (const name of [
		"OPENAI_API_KEY",
		"ANTHROPIC_API_KEY",
		"NODE_OPTIONS",
		"AWS_PROFILE",
		"GOOGLE_APPLICATION_CREDENTIALS",
		"PI_AUTH_FILE",
	])
		expect(environment[name]).toBeUndefined();
	expect(environment.HOME).not.toBe(process.env.HOME);
	const engine = createSpoolEngine(makeTempDir());
	onTestFinished(() => engine.close?.());
	expect(await engine.account(makeTempDir())).toMatchObject({ signedIn: false, account: null });
});

it.each([
	{ loss: "SIGKILL", permissions: "bypass" },
	{ loss: "disconnect", permissions: "bypass" },
	{ loss: "SIGKILL", permissions: "ask" },
	{ loss: "disconnect", permissions: "ask" },
] as const)(
	"retires an active $permissions command and its child when the host loses $loss ownership",
	{ timeout: 20_000 },
	async ({ loss, permissions }) => {
		const directory = makeTempDir();
		const root = makeTempDir();
		writeFrame(root, "home", "export default () => null");
		const marker = `spool-crash-child-${randomUUID()}`;
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			cwd: root,
			env: bundledEnvironment(directory),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		const client = new BundledHostClient(directory, () => child);
		let commandPid: number | undefined;
		const alive = processAlive;
		onTestFinished(async () => {
			if (commandPid !== undefined) {
				try {
					process.kill(-commandPid, "SIGKILL");
				} catch {
					/* Already retired. */
				}
			}
			if (child.exitCode === null && child.signalCode === null) {
				const exited = once(child, "exit");
				child.kill("SIGKILL");
				await exited;
			}
		});
		await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
		const command = `echo $$ > design/command.pid; /bin/bash -c 'echo $$ > design/child.pid; while [ ! -e design/release ]; do sleep 0.02; done; printf late >> design/effects' ${marker} & wait`;
		const turn = client.turn({
			kind: "turn",
			options: {
				root,
				session: { id: randomUUID() },
				permissions,
				ask: { value: "spool/openai/api_key/spool-test" },
				said: [
					{ selection: "", prompt: `file tools: ${JSON.stringify([{ name: "bash", arguments: { command } }])}` },
				],
			},
		});
		const events: AgentEvent[] = [];
		const read = (async () => {
			for await (const event of turn.events) events.push(event);
		})();
		await expect.poll(() => existsSync(join(root, "design/child.pid")), { timeout: 10_000 }).toBe(true);
		const namespaced = permissions === "ask" && process.platform === "linux";
		if (!namespaced) commandPid = Number(readFileSync(join(root, "design/command.pid"), "utf8"));
		const grandchild = namespaced
			? readdirSync("/proc")
					.filter((entry) => /^\d+$/.test(entry))
					.map(Number)
					.find((pid) => {
						try {
							return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").includes(marker);
						} catch {
							return false;
						}
					})
			: Number(readFileSync(join(root, "design/child.pid"), "utf8"));
		if (grandchild === undefined) throw new Error("Missing actual command child PID");
		if (commandPid !== undefined) expect(alive(commandPid)).toBe(true);
		expect(alive(grandchild)).toBe(true);
		const exited = once(child, "exit");
		if (loss === "SIGKILL") child.kill("SIGKILL");
		else child.disconnect();
		await exited;
		await read;
		expect(events.at(-1)).toMatchObject({ kind: "closed" });
		expect(events.filter((event) => event.kind === "asking")).toEqual([]);
		await expect.poll(() => alive(grandchild), { timeout: 2000 }).toBe(false);
		if (commandPid !== undefined) await expect.poll(() => alive(commandPid ?? 0), { timeout: 2000 }).toBe(false);
		writeFileSync(join(root, "design/release"), "release");
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(existsSync(join(root, "design/effects"))).toBe(false);
		expect(readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
	},
);

it("retires a real detached Chromium descendant when a chatty command's host is killed", {
	timeout: 30_000,
}, async () => {
	const directory = makeTempDir();
	const root = makeTempDir();
	writeFileSync(
		join(root, "browser.mjs"),
		`
import { writeFileSync, appendFileSync } from "node:fs";
import { chromium } from ${JSON.stringify(import.meta.resolve("playwright-core"))};
const browser = await chromium.launchServer({channel: "chromium-headless-shell", headless: true});
const connection = await chromium.connect(browser.wsEndpoint());
await connection.newPage();
writeFileSync("command.pid", String(process.pid));
writeFileSync("browser.pid", String(browser.process().pid));
setInterval(() => { appendFileSync("effects", "tick\\n"); process.stdout.write("chatty fixture\\n".repeat(1000)); }, 10);
`,
	);
	const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
		cwd: root,
		env: bundledEnvironment(directory),
		execArgv: ["--import", import.meta.resolve("tsx")],
		stdio: ["ignore", "ignore", "ignore", "ipc"],
	});
	const client = new BundledHostClient(directory, () => child);
	const pids: number[] = [];
	onTestFinished(async () => {
		for (const pid of pids) {
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				/* Already retired. */
			}
		}
		if (child.exitCode === null && child.signalCode === null) {
			const exited = once(child, "exit");
			child.kill("SIGKILL");
			await exited;
		}
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	const turn = client.turn({
		kind: "turn",
		options: {
			root,
			session: { id: randomUUID() },
			permissions: "bypass",
			ask: { value: "spool/openai/api_key/spool-test" },
			said: [
				{
					selection: "",
					prompt: `file tools: ${JSON.stringify([{ name: "bash", arguments: { command: `${quote(process.execPath)} ${quote(join(root, "browser.mjs"))}` } }])}`,
				},
			],
		},
	});
	const events: AgentEvent[] = [];
	const read = (async () => {
		for await (const event of turn.events) events.push(event);
	})();
	await expect.poll(() => existsSync(join(root, "effects")), { timeout: 10_000 }).toBe(true);
	pids.push(...["command.pid", "browser.pid"].map((file) => Number(readFileSync(join(root, file), "utf8"))));
	if (child.pid === undefined) throw new Error("Missing host PID");
	const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" })
		.trim()
		.split("\n")
		.map((line) => line.trim().split(/\s+/).map(Number));
	const owned = new Set([child.pid]);
	for (;;) {
		const count = owned.size;
		for (const [pid, parent] of rows)
			if (pid !== undefined && parent !== undefined && owned.has(parent)) owned.add(pid);
		if (owned.size === count) break;
	}
	owned.delete(child.pid);
	expect(owned.size).toBeGreaterThan(3); // helper, command, browser and browser subprocesses
	pids.push(...owned);
	const exited = once(child, "exit");
	child.kill("SIGKILL");
	await exited;
	await read;
	for (const pid of pids) await expect.poll(() => processAlive(pid), { timeout: 5000 }).toBe(false);
	const effects = readFileSync(join(root, "effects"), "utf8");
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(readFileSync(join(root, "effects"), "utf8")).toBe(effects);
	expect(events.at(-1)).toMatchObject({ kind: "closed", code: 1 });
});

function processAlive(pid: number): boolean {
	try {
		if (process.platform === "linux" && /^State:\s+Z/m.test(readFileSync(`/proc/${pid}/status`, "utf8")))
			return false;
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
