import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import type { Context } from "@earendil-works/pi-ai";
import { expect, it, onTestFinished, vi } from "vitest";
import { makeTempDir, markProject, writeFrame } from "../test-helpers";
import type { EngineTurnOptions } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import { trustedCommand } from "./bundled-command-route";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";

const command = (command: string, extra: Record<string, unknown> = {}) => ({
	name: "bash",
	arguments: { command, ...extra },
});
function options(
	root: string,
	calls: { name: string; arguments: Record<string, unknown> }[],
	id = randomUUID(),
): EngineTurnOptions {
	return {
		root,
		session: { id },
		permissions: "ask",
		ask: { value: "spool/openai/api_key/spool-test" },
		said: [{ selection: "", prompt: `file tools: ${JSON.stringify(calls)}` }],
	};
}
async function setup() {
	const root = makeTempDir();
	writeFrame(root, "home", "export default () => <h1>Original</h1>");
	const directory = join(makeTempDir(), "bundled");
	const contexts: Context[] = [];
	const runtime = await deterministicBundledRuntime(directory, (context) => contexts.push(structuredClone(context)));
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-secret-key" });
	onTestFinished(() => runtime.close());
	return { root, directory, runtime, contexts };
}

it("type-checks frames offline with this package and returns diagnostics to the model", {
	timeout: 30_000,
}, async () => {
	const { root, directory, runtime, contexts } = await setup();
	markProject(root);
	writeFrame(root, "home", "const label: string = 42; export default () => <h1>{label}</h1>");
	const bin = makeTempDir();
	const marker = join(root, "wrong-installation");
	writeFileSync(join(bin, "spool"), `#!/bin/sh\nprintf wrong >> '${marker}'\n`, { mode: 0o755 });
	vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
	onTestFinished(() => {
		vi.unstubAllEnvs();
	});
	const events: AgentEvent[] = [];
	await runtime.turn(
		"check",
		options(root, [
			command("spool check"),
			command(`spool check ${root}`),
			{
				name: "write",
				arguments: { path: "design/frames/home/frame.tsx", content: "export default () => <h1>Fixed</h1>" },
			},
			command("spool check ."),
		]),
		(event) => events.push(event),
	);
	expect(events.filter((event) => event.kind === "asking")).toEqual([]);
	expect(existsSync(marker)).toBe(false);
	expect(existsSync(join(directory, "../daemon.json"))).toBe(false);
	const results = events.filter((event) => event.kind === "result");
	expect(results.map((event) => event.failed)).toEqual([true, true, false, false]);
	for (const result of results.slice(0, 2)) {
		expect(result.text).toContain("design/frames/home/frame.tsx");
		expect(result.text).toContain("TS2322");
		expect(result.text).toContain("Command exited with code 1");
	}
	const modelResults = contexts.at(-1)?.messages.filter((message) => message.role === "toolResult");
	expect(modelResults?.[0]).toMatchObject({
		isError: true,
		content: [{ type: "text", text: expect.stringContaining("TS2322") }],
	});
	expect(modelResults?.at(-1)).toMatchObject({ isError: false, details: { exitCode: 0 } });
});

it("refuses unsupported and nested bare Spool invocations without reaching another installation", async () => {
	const { root, runtime } = await setup();
	const bin = makeTempDir();
	const marker = join(root, "wrong-installation");
	writeFileSync(join(bin, "spool"), `#!/bin/sh\nprintf wrong >> '${marker}'\n`, { mode: 0o755 });
	vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
	onTestFinished(() => {
		vi.unstubAllEnvs();
	});
	const events: AgentEvent[] = [];
	await runtime.turn(
		"wrong-installation",
		{
			...options(root, [
				command("spool logs home && spool url home"),
				command("spool open ."),
				command("printf side-effect > compound-effect; spool status"),
				command("env spool status"),
				command("'spool' status"),
				command("bash -c 'spool status'"),
				command("printf unused | spool status"),
			]),
			permissions: "bypass",
		},
		(event) => events.push(event),
	);
	expect(existsSync(marker)).toBe(false);
	expect(readFileSync(join(root, "compound-effect"), "utf8")).toBe("side-effect");
	expect(events.filter((event) => event.kind === "asking")).toEqual([]);
	const results = events.filter((event) => event.kind === "result");
	expect(results).toHaveLength(7);
	for (const result of results)
		expect(result).toMatchObject({ failed: true, text: expect.stringContaining("one Spool command per tool call") });
});

it("keeps Spool words in ordinary shell arguments and file paths usable", async () => {
	const { root, runtime } = await setup();
	const events: AgentEvent[] = [];
	await runtime.turn(
		"literal-arguments",
		{
			...options(root, [
				command("printf '%s' spool"),
				command("printf '%s' 'help: spool logs home; spool url home'"),
				command("printf '%s' /tmp/spool/file"),
				command("printf '%s' 'spool status'"),
			]),
			permissions: "bypass",
		},
		(event) => events.push(event),
	);
	expect(events.filter((event) => event.kind === "result").map((event) => event.failed)).toEqual([
		false,
		false,
		false,
		false,
	]);
});

// Linux commands see namespace-local PIDs. Find the fixture child by its exact
// unique argv item in the host's /proc before asserting that Stop retired it.
function childPid(file: string, marker: string): number | undefined {
	if (!existsSync(file)) return undefined;
	if (process.platform !== "linux") return Number(readFileSync(file, "utf8"));
	for (const entry of readdirSync("/proc")) {
		if (!/^\d+$/.test(entry)) continue;
		try {
			if (readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0").includes(marker)) return Number(entry);
		} catch {
			/* A process may exit between listing and reading. */
		}
	}
	return undefined;
}

function childAlive(pid: number): boolean {
	try {
		// An orphan awaiting reaping cannot execute or retain live sandbox work.
		if (process.platform === "linux" && /^State:\s+Z/m.test(readFileSync(`/proc/${pid}/status`, "utf8")))
			return false;
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

it("runs real sandboxed native commands quietly, denies outside and symlink writes and protected reads", async () => {
	const cleanup = vi.spyOn(SandboxManager, "cleanupAfterCommand");
	onTestFinished(() => cleanup.mockRestore());
	const { root, directory, runtime, contexts } = await setup();
	mkdirSync(join(root, "outside"));
	symlinkSync(join(root, "outside"), join(root, "design", "escape"));
	writeFileSync(join(directory, "../daemon.json"), "fixture-control-secret");
	const events: AgentEvent[] = [];
	await runtime.turn(
		"quiet",
		options(root, [
			command("printf allowed > design/ok"),
			{ name: "read", arguments: { path: "design/ok" } },
			{ name: "edit", arguments: { path: "design/ok", edits: [{ oldText: "allowed", newText: "edited" }] } },
			command("cat design/ok"),
			command("printf denied > outside/no"),
			command("printf denied > design/escape/no"),
			command("printf denied > design/../outside/no"),
			command(`cat '${join(directory, "credentials.json")}'`),
			command(`cat '${join(directory, "../daemon.json")}'`),
		]),
		(event) => {
			events.push(event);
			if (event.kind === "asking")
				void runtime.request({ kind: "answer", turn: "quiet", request: event.request, reply: { kind: "deny" } });
		},
	);
	expect(events.filter((event) => event.kind === "asking")).toEqual([]);
	// Seven shell commands and the one-time startup probe each release their sandbox.
	expect(cleanup).toHaveBeenCalledTimes(8);
	expect(readFileSync(join(root, "design/ok"), "utf8")).toBe("edited");
	expect(existsSync(join(root, "outside/no"))).toBe(false);
	const results = events.filter((event) => event.kind === "result");
	expect(results.map((event) => event.failed)).toEqual([false, false, false, false, true, true, true, true, true]);
	expect(JSON.stringify(contexts.at(-1))).not.toContain("fixture-secret-key");
	expect(JSON.stringify(contexts.at(-1))).not.toContain("fixture-control-secret");
}, 30_000);

it("keeps requested scopes per command and thread, separate from file grants, and expires them on restart", async () => {
	const { root, runtime, directory } = await setup();
	mkdirSync(join(root, "outside"));
	const id = randomUUID();
	const asks: AgentEvent[] = [];
	const run = async (turn: string, calls: ReturnType<typeof command>[], session = id) =>
		runtime.turn(turn, options(root, calls, session), (event) => {
			if (event.kind !== "asking") return;
			asks.push(event);
			void runtime.request({
				kind: "answer",
				turn,
				request: event.request,
				reply: { kind: turn === "grant" ? "always" : "deny" },
			});
		});
	await run("grant", [command("printf yes > outside/yes", { writable_paths: ["outside"] })]);
	expect(asks).toHaveLength(1);
	await Promise.all([
		run("reused", [command("printf yes > outside/reused", { writable_paths: ["outside"] })]),
		run("other", [command("printf no > outside/other")], randomUUID()),
	]);
	expect(asks).toHaveLength(1);
	expect(existsSync(join(root, "outside/reused"))).toBe(true);
	expect(existsSync(join(root, "outside/other"))).toBe(false);
	await run("new-thread", [command("printf no > outside/new", { writable_paths: ["outside"] })], randomUUID());
	expect(asks).toHaveLength(2);
	await runtime.close();
	const restarted = await deterministicBundledRuntime(directory);
	onTestFinished(() => restarted.close());
	await restarted.turn(
		"restart",
		options(root, [command("printf no > outside/restart", { writable_paths: ["outside"] })], id),
		(event) => {
			if (event.kind !== "asking") return;
			asks.push(event);
			void restarted.request({ kind: "answer", turn: "restart", request: event.request, reply: { kind: "deny" } });
		},
	);
	expect(asks).toHaveLength(3);
	expect(existsSync(join(root, "outside/restart"))).toBe(false);
}, 30_000);

it("edits keeps command approval pending, bypass releases it and direct file protection stays enforced", async () => {
	const { root, directory, runtime } = await setup();
	vi.stubEnv("OPENAI_API_KEY", "ambient-key");
	vi.stubEnv("SPOOL_CONTROL_TOKEN", "ambient-control");
	onTestFinished(() => {
		vi.unstubAllEnvs();
	});
	const events: AgentEvent[] = [];
	await runtime.turn(
		"bypass",
		options(root, [
			command(`cat '${join(directory, "credentials.json")}' > outside-read; env > design/env`, {
				unsandboxed: true,
			}),
			{ name: "read", arguments: { path: join(directory, "credentials.json") } },
		]),
		(event) => {
			events.push(event);
			if (event.kind !== "asking") return;
			void (async () => {
				await runtime.request({ kind: "permissions", turn: "bypass", mode: "edits" });
				expect(existsSync(join(root, "outside-read"))).toBe(false);
				expect(events.filter((event) => event.kind === "answered")).toHaveLength(0);
				await runtime.request({ kind: "permissions", turn: "bypass", mode: "bypass" });
			})();
		},
	);
	// Explicitly unsandboxed commands have the user's filesystem access. Environment clearing is not file isolation.
	expect(readFileSync(join(root, "outside-read"), "utf8")).toContain("fixture-secret-key");
	expect(readFileSync(join(root, "design/env"), "utf8")).not.toMatch(
		/ambient-key|ambient-control|SPOOL_BUNDLED_STATE|PI_CODING_AGENT_DIR/,
	);
	expect(events.filter((event) => event.kind === "result").at(-1)).toMatchObject({
		failed: true,
		text: "Spool control and credential files are protected",
	});
});

it("Stop settles pending approval and kills the actual command's stubborn child", async () => {
	const { root, runtime } = await setup();
	const pending = runtime.turn(
		"waiting",
		options(root, [command("touch outside", { unsandboxed: true })]),
		(event) => {
			if (event.kind === "asking") void runtime.request({ kind: "stop", turn: "waiting" });
		},
	);
	await pending;
	expect(existsSync(join(root, "outside"))).toBe(false);
	const marker = `spool-child-${randomUUID()}`;
	const running = runtime.turn(
		"running",
		options(root, [
			command(`bash -c 'trap "" TERM; echo $$ > design/child.pid; while true; do sleep 1; done' ${marker} & wait`),
		]),
		() => {},
	);
	await expect.poll(() => childPid(join(root, "design/child.pid"), marker), { timeout: 10_000 }).toBeDefined();
	const pid = childPid(join(root, "design/child.pid"), marker);
	if (pid === undefined) throw new Error("Missing actual fixture child PID");
	await runtime.request({ kind: "stop", turn: "running" });
	await running;
	expect(existsSync(join(root, "design/canvas.json"))).toBe(false);
	await expect.poll(() => childAlive(pid)).toBe(false);
}, 20_000);

it("never gives shell syntax, other packages, writes, extra flags or arbitrary scripts the trusted route", () => {
	for (const command of [
		"spool check",
		"spool check .",
		"spool check /tmp/project",
		"spool shot home",
		"spool logs home --scenario error",
		"spool skill verbs",
		"spool skill shaders",
		"spool url home --raw",
		"spool shot home --viewport 600x400 --at 0",
		"spool status",
		"spool flows",
		"spool selection",
	])
		expect(trustedCommand(command), command).toBeDefined();
	for (const command of [
		"spool check --help",
		"spool check . other",
		"spool check; touch outside",
		"spool *",
		"spool shot home; touch outside",
		"spool shot $(cat secret)",
		"spool shot home && true",
		"spool shot ../home",
		"spool shot home --output /tmp/output",
		"spool shot home --at 1 --at 2",
		"spool status > outside",
		"SPOOL_DIR=/tmp spool status",
		"./spool status",
		"node scripts/spool.mjs",
		"spool upgrade",
		"spool shot home\ncat secret",
		"spool shot home `id`",
	])
		expect(trustedCommand(command), command).toBeUndefined();
});

it("keeps file and command grants distinct, limits once, checks nonexistent protected paths, and saves complete long output", async () => {
	const { root, runtime } = await setup();
	const events: AgentEvent[] = [];
	let prompts = 0;
	await runtime.turn(
		"separate",
		options(root, [
			{ name: "write", arguments: { path: "outside/a", content: "file" } },
			command("printf command > outside/b", { writable_paths: ["outside"] }),
			command("printf denied > outside/c", { writable_paths: ["outside"] }),
			command("mkdir -p design/.spool; printf denied > design/.spool/no"),
			command("printf denied > design/canvas.json"),
			command(`'${process.execPath}' -e 'process.stdout.write("start" + "x".repeat(210000) + "end")'`),
		]),
		(event) => {
			events.push(event);
			if (event.kind !== "asking") return;
			prompts++;
			void runtime.request({
				kind: "answer",
				turn: "separate",
				request: event.request,
				reply: { kind: prompts === 1 ? "always" : prompts === 2 ? "allow" : "deny" },
			});
		},
	);
	expect(prompts).toBe(3);
	expect(readFileSync(join(root, "outside/b"), "utf8")).toBe("command");
	expect(existsSync(join(root, "outside/c"))).toBe(false);
	expect(existsSync(join(root, "design/.spool/no"))).toBe(false);
	const results = events.filter((event) => event.kind === "result");
	expect(results.map((event) => event.failed)).toEqual([false, false, true, true, true, false]);
	const canvas = join(root, "design/canvas.json");
	const bytes = existsSync(canvas) ? readFileSync(canvas) : undefined;
	expect(bytes?.toString() ?? "", `protected path bytes: ${bytes?.toString("hex") ?? "absent"}`).not.toContain(
		"denied",
	);
	expect(existsSync(join(root, "design/canvas.json"))).toBe(false);
	const full = /full output: (.+)\]/.exec(results.at(-1)?.text ?? "")?.[1];
	if (!full) throw new Error("Missing complete output path");
	expect(readFileSync(full, "utf8")).toBe(`start${"x".repeat(210000)}end`);
}, 30_000);

it("keeps a running sandbox's deny mounts through another command's cleanup and restores absent paths after the last exit", async () => {
	const { root, runtime } = await setup();
	const events: AgentEvent[] = [];
	const run = (id: string, calls: ReturnType<typeof command>[]) =>
		runtime.turn(id, options(root, calls), (event) => {
			events.push(event);
			if (event.kind === "asking")
				void runtime.request({ kind: "answer", turn: id, request: event.request, reply: { kind: "deny" } });
		});
	const held = run("held", [
		command(
			"touch design/ready; while [ ! -e design/release ]; do sleep 0.05; done; printf denied > design/canvas.json",
		),
	]);
	try {
		await expect.poll(() => existsSync(join(root, "design/ready")), { timeout: 10_000 }).toBe(true);
		await run("overlap", [command("printf denied > design/canvas.json")]);
		const canvas = join(root, "design/canvas.json");
		// Linux retains its empty host mount point while the other command owns it.
		// macOS has no host mount point; both platforms must forbid content.
		if (process.platform === "linux") expect(readFileSync(canvas).length).toBe(0);
		else expect(existsSync(canvas)).toBe(false);
		writeFileSync(join(root, "design/release"), "release");
		await held;
		expect(events.filter((event) => event.kind === "asking")).toEqual([]);
		expect(events.filter((event) => event.kind === "result").map((event) => event.failed)).toEqual([true, true]);
		expect(existsSync(canvas)).toBe(false);
		expect(existsSync(join(root, "design/.spool"))).toBe(false);
		// Cleanup must preserve user-owned protected files, including empty files.
		for (const content of ["original user content", ""]) {
			writeFileSync(canvas, content);
			await run(`existing-${content.length}`, [command("printf denied > design/canvas.json")]);
			expect(readFileSync(canvas, "utf8")).toBe(content);
			expect(events.filter((event) => event.kind === "result").at(-1)).toMatchObject({ failed: true });
		}
	} finally {
		await runtime.request({ kind: "stop", turn: "held" });
		await held;
	}
}, 30_000);

it("cleans actual sandbox mounts after a timeout and retires the command's child", async () => {
	const { root, runtime } = await setup();
	const events: AgentEvent[] = [];
	const marker = `spool-child-${randomUUID()}`;
	const running = runtime.turn(
		"timeout",
		options(root, [
			command(`bash -c 'trap "" TERM; echo $$ > design/timed.pid; while true; do sleep 1; done' ${marker} & wait`, {
				timeout: 2,
			}),
		]),
		(event) => {
			events.push(event);
			if (event.kind === "asking")
				void runtime.request({ kind: "answer", turn: "timeout", request: event.request, reply: { kind: "deny" } });
		},
	);
	await expect.poll(() => childPid(join(root, "design/timed.pid"), marker), { timeout: 10_000 }).toBeDefined();
	const pid = childPid(join(root, "design/timed.pid"), marker);
	if (pid === undefined) throw new Error("Missing actual fixture child PID");
	await running;
	expect(events.filter((event) => event.kind === "asking")).toEqual([]);
	expect(events.filter((event) => event.kind === "result")).toMatchObject([
		{ failed: true, text: "Command timed out" },
	]);
	expect(existsSync(join(root, "design/canvas.json"))).toBe(false);
	await expect.poll(() => childAlive(pid)).toBe(false);
}, 20_000);
