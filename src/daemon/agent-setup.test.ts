import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { machineAgents, makeApp, makeTempDir } from "../test-helpers";
import {
	type AgentSetupPlans,
	agentSetupPlans,
	createAgentSetup,
	type MachineAgent,
	type SetupProcess,
	spawnSetup,
} from "./agent-setup";

/**
 * The first run's agents (spool#250), at the machine's own door: what each agent is here,
 * and the installs and sign-ins spool runs for them. The commands are real processes
 * standing in for the vendors' (`machineAgents`), so what runs is what a person's machine
 * would run, minus the download.
 */

const POLL = { timeout: 10_000, interval: 50 };

function setupApp(
	installed: Parameters<typeof machineAgents>[0] = [],
	signedIn: Parameters<typeof machineAgents>[1] = [],
) {
	const machine = machineAgents(installed, signedIn);
	const env: Record<string, string | undefined> = { ...process.env, PATH: "/usr/bin" };
	const app = makeApp(makeTempDir(), {
		agentEngines: machine.engines,
		agentSetup: { plans: machine.plans, env, piDir: join(machine.dir, "pi") },
	});
	const agents = async () => (await (await app.request("/api/agents")).json()) as MachineAgent[];
	const one = async (id: string) => (await agents()).find((agent) => agent.id === id);
	return { app, machine, env, agents, one };
}

describe("the machine's agents", () => {
	it("says what each agent is here, and the line to type for it", async () => {
		const { agents } = setupApp(["codex"], ["codex"]);

		expect(await agents()).toEqual([
			expect.objectContaining({ id: "claude", installed: false, signedIn: false, job: null }),
			expect.objectContaining({ id: "codex", installed: true, signedIn: true, account: "ada@kaffe.se" }),
			expect.objectContaining({ id: "pi", installed: false, install: { line: "install pi", unattended: true } }),
		]);
	});

	it("installs an agent, puts its bin on PATH, and goes on to its own sign-in", async () => {
		const { app, machine, env, one } = setupApp();

		expect((await app.request("/api/agents/claude/install", { method: "POST" })).status).toBe(202);
		// a second installer while one runs would fight it over the same profile
		expect((await app.request("/api/agents/codex/install", { method: "POST" })).status).toBe(409);

		// the sign-in's page, out of the terminal link it was printed in, and its ask for a code
		await expect
			.poll(() => one("claude"), POLL)
			.toMatchObject({
				installed: true,
				job: { kind: "sign-in", state: "running", url: "https://example.com/claude/login", asksCode: true },
			});
		expect(env.PATH?.split(delimiter)[0]).toBe(machine.bin);

		const code = await app.request("/api/agents/claude/code", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ code: "good-code" }),
		});
		expect(code.status).toBe(204);
		await expect
			.poll(() => one("claude"), POLL)
			.toMatchObject({ installed: true, signedIn: true, account: "ada@kaffe.se", job: null });
	});

	it("keeps what a sign-in said when it didn't finish", async () => {
		const { app, one } = setupApp(["codex"]);
		await app.request("/api/agents/codex/sign-in", { method: "POST" });
		await expect.poll(() => one("codex"), POLL).toMatchObject({ job: { asksCode: true } });
		await app.request("/api/agents/codex/code", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ code: "typo" }),
		});
		await expect.poll(() => one("codex"), POLL).toMatchObject({ signedIn: false, job: { state: "failed" } });
		expect((await one("codex"))?.job?.lines.at(-1)).toBe("The sign-in didn’t finish.");
	});

	it("refuses what it can't run here, naming the line to type", async () => {
		const machine = machineAgents();
		const plans: AgentSetupPlans = { ...machine.plans, pi: { ...machine.plans.pi, install: null, signIn: null } };
		const app = makeApp(makeTempDir(), { agentEngines: machine.engines, agentSetup: { plans } });

		const install = await app.request("/api/agents/pi/install", { method: "POST" });
		expect(install.status).toBe(409);
		expect(await install.text()).toContain("install pi");
		expect((await app.request("/api/agents/pi/sign-in", { method: "POST" })).status).toBe(409);
	});
});

/** A command that runs until the test lets it end; `kill` only asks, as a real tree takes its time going. */
function heldProcess() {
	let end: (code: number | null) => void = () => {};
	const exited = new Promise<number | null>((resolve) => {
		end = resolve;
	});
	let killed = false;
	const proc: SetupProcess = {
		onLine: () => {},
		write: () => {},
		kill: () => {
			killed = true;
		},
		exited,
	};
	return { proc, end, killed: () => killed };
}

describe("stopping a setup", () => {
	it.skipIf(process.platform === "win32")("takes back everything the command started", async () => {
		const dir = makeTempDir();
		const pidFile = join(dir, "grandchild");
		// a shell piping into a shell, as `curl … | bash` is: the grandchild outlives a signal to the one pid
		const script = `const c=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"});require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(c.pid));console.log("started");setInterval(()=>{},1000)`;
		const proc = spawnSetup({ command: process.execPath, args: ["-e", script] }, process.env);
		await new Promise<void>((resolve) => proc.onLine((line) => line === "started" && resolve()));
		const grandchild = Number(readFileSync(pidFile, "utf8"));

		proc.kill();
		await proc.exited;
		const alive = () => {
			try {
				process.kill(grandchild, 0);
				return true;
			} catch {
				return false;
			}
		};
		// a killed process lingers until whoever adopted it reaps it
		await expect.poll(alive, { timeout: 2000 }).toBe(false);
	});

	it("keeps the install slot until a stopped installer has gone, and starts nothing after a stop", async () => {
		const machine = machineAgents();
		const installs = new Map<string, ReturnType<typeof heldProcess>>();
		let probing: (() => void) | undefined;
		const engines = new Map(
			machine.engines.map((engine) => [
				engine.id,
				engine.id === "codex"
					? {
							...engine,
							installed: () => true,
							// the account probe after an install, held so a stop lands during it
							account: () =>
								new Promise<{ signedIn: boolean; account: null }>((resolve) => {
									probing = () => resolve({ signedIn: false, account: null });
								}),
						}
					: engine,
			]),
		);
		const ran: string[] = [];
		const setup = createAgentSetup({
			engines,
			plans: machine.plans,
			home: machine.dir,
			piDir: join(machine.dir, "pi"),
			emit: () => {},
			run: (command) => {
				const id =
					machine.plans.claude.install === command
						? "claude"
						: command === machine.plans.codex.install
							? "codex"
							: "other";
				ran.push(id);
				const held = heldProcess();
				installs.set(id, held);
				return held.proc;
			},
		});

		expect(setup.install("claude")).toBeUndefined();
		setup.cancel("claude");
		expect(installs.get("claude")?.killed()).toBe(true);
		// still going: no second installer starts beside it
		expect(setup.install("codex")).toMatchObject({ status: 409 });
		installs.get("claude")?.end(null);
		await expect.poll(() => setup.install("codex")).toBeUndefined();
		expect(setup.snapshot().find((agent) => agent.id === "claude")?.job).toBeNull();

		// codex's installer ends, and while spool asks codex who is signed in, the person stops it
		installs.get("codex")?.end(0);
		await expect.poll(() => probing).toBeDefined();
		setup.cancel("codex");
		probing?.();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(ran).toEqual(["claude", "codex"]);
		expect(setup.snapshot().find((agent) => agent.id === "codex")?.job).toBeNull();
	});
});

describe("the official installers", () => {
	const has = (present: readonly string[]) => (command: string) => present.includes(command);

	it("plans each vendor's own installer, and none where it can't run", () => {
		const mac = agentSetupPlans({ platform: "darwin", home: "/Users/ada", has: has(["curl", "bash", "sh", "npm"]) });
		expect(mac.claude.install).toEqual({
			command: "bash",
			args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
		});
		expect(mac.codex.install).toMatchObject({ command: "sh", env: { CODEX_NON_INTERACTIVE: "1" } });
		expect(mac.pi.install?.args).toEqual(["install", "-g", "@earendil-works/pi-coding-agent"]);
		expect(mac.claude.bin).toBe(join("/Users/ada", ".local", "bin"));
		// pi signs in with a plan only from inside its own session
		expect(mac.pi.signIn).toBeNull();

		const bare = agentSetupPlans({ platform: "linux", home: "/home/ada", has: has([]) });
		expect([bare.claude.install, bare.codex.install, bare.pi.install]).toEqual([null, null, null]);
		expect(bare.pi.installLine).toBe("npm install -g @earendil-works/pi-coding-agent");

		const windows = agentSetupPlans({ platform: "win32", home: "C:\\Users\\ada", has: has(["npm.cmd"]) });
		expect(windows.claude.install?.command).toBe("powershell");
		expect(windows.pi.install?.command).toBe("npm.cmd");
	});
});

describe("a key for pi", () => {
	/** pi as `pi auth check` and `--list-models` answer, from what auth.json says */
	function piAnswers(piDir: string) {
		return (command: { command: string; args: readonly string[] }): SetupProcess => {
			let lines: string[] = [];
			const auth = JSON.parse(readFileSync(join(piDir, "auth.json"), "utf8")) as Record<string, { key?: string }>;
			if (command.args[0] === "auth") {
				const provider = command.args[3] ?? "";
				const ready = auth[provider]?.key?.startsWith("sk-") === true;
				lines = [JSON.stringify({ status: ready ? "ready" : "invalid", provider })];
			} else lines = ["provider  model", "anthropic claude-a", "anthropic claude-b", "openai-codex gpt"];
			const listeners: ((line: string) => void)[] = [];
			const exited = Promise.resolve().then(() => {
				for (const line of lines) for (const listener of listeners) listener(line);
				return 0;
			});
			return { onLine: (listener) => listeners.push(listener), write: () => {}, kill: () => {}, exited };
		};
	}

	it("saves a key pi takes beside what pi already keeps, and takes back one it doesn't", async () => {
		const machine = machineAgents(["pi"]);
		const piDir = join(machine.dir, "pi");
		const app = makeApp(makeTempDir(), {
			agentEngines: machine.engines,
			agentSetup: { plans: machine.plans, piDir, run: piAnswers(piDir) },
		});
		const key = (provider: string, value: string) =>
			app.request("/api/agents/pi/key", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider, key: value }),
			});
		mkdirSync(piDir, { recursive: true });
		writeFileSync(join(piDir, "auth.json"), JSON.stringify({ "openai-codex": { type: "oauth", access: "a" } }));

		expect(await (await key("anthropic", " sk-ant-123 ")).json()).toEqual({ ok: true, models: 2 });
		expect(JSON.parse(readFileSync(join(piDir, "auth.json"), "utf8"))).toEqual({
			"openai-codex": { type: "oauth", access: "a" },
			anthropic: { type: "api_key", key: "sk-ant-123" },
		});

		expect(await (await key("openai", "typo")).json()).toEqual({ ok: false, reason: "pi didn't take that key." });
		expect(Object.keys(JSON.parse(readFileSync(join(piDir, "auth.json"), "utf8")))).toEqual([
			"openai-codex",
			"anthropic",
		]);
		expect((await key("not-a-provider", "sk-1")).status).toBe(400);
	});
});
