import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { join } from "node:path";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { makeTempDir } from "../test-helpers";
import type { AgentEvent } from "./agent-events";
import { BundledCommandPolicy, BundledCommandTurn } from "./bundled-commands";
import { BundledFilePolicy } from "./bundled-files";
import { closeBundledSandbox } from "./bundled-sandbox";

vi.mock("node:fs", async (original) => ({ ...(await original<typeof import("node:fs")>()) }));
vi.mock("node:child_process", async (original) => ({ ...(await original<typeof import("node:child_process")>()) }));

// Inject sandbox preparation and rare spawn/I/O failures around real child
// processes. Native containment and Linux mount behavior have separate tests.
beforeEach(() => {
	vi.spyOn(SandboxManager, "checkDependenciesAsync").mockResolvedValue({ errors: [], warnings: [] });
	vi.spyOn(SandboxManager, "initialize").mockResolvedValue();
	vi.spyOn(SandboxManager, "reset").mockResolvedValue();
	vi.spyOn(SandboxManager, "wrapWithSandboxArgv").mockImplementation(async (command) => ({
		argv: ["/bin/bash", "-c", command],
		env: {},
	}));
	vi.spyOn(SandboxManager, "cleanupAfterCommand").mockImplementation(() => {});
});
afterEach(async () => {
	await closeBundledSandbox();
	vi.restoreAllMocks();
});

function setup(emit: (event: AgentEvent) => void = () => {}) {
	const root = makeTempDir();
	const policy = new BundledCommandPolicy(new BundledFilePolicy(root, join(makeTempDir(), "bundled")));
	onTestFinished(() => policy.close());
	const turn = new BundledCommandTurn(policy, "ask", emit);
	const unused = (): never => {
		throw new Error("Command tools must not access the provider context");
	};
	const context: ExtensionContext = {
		get ui() {
			return unused();
		},
		get sessionManager() {
			return unused();
		},
		get modelRegistry() {
			return unused();
		},
		mode: "json",
		hasUI: false,
		cwd: root,
		model: undefined,
		scopedModels: [],
		signal: undefined,
		isIdle: unused,
		isProjectTrusted: unused,
		abort: unused,
		hasPendingMessages: unused,
		shutdown: unused,
		getContextUsage: unused,
		compact: unused,
		getSystemPrompt: unused,
	};
	const run = (command = "true") => turn.tool().execute("fixture", { command }, undefined, undefined, context);
	return { root, policy, turn, run };
}

it("keeps the shell refusal executable private and removes it with its command session", () => {
	const { policy } = setup();
	expect(fs.statSync(policy.scratch).mode & 0o777).toBe(0o700);
	expect(fs.statSync(join(policy.scratch, "bin")).mode & 0o777).toBe(0o700);
	expect(fs.statSync(join(policy.scratch, "bin/spool")).mode & 0o777).toBe(0o500);
	policy.close();
	expect(fs.existsSync(policy.scratch)).toBe(false);
});

it.each([
	"async spawn",
	"sync helper fork",
	"log open",
	"log write",
	"log close",
	"result processing",
	"stop before spawn",
])("releases a prepared command once after %s failure", async (failure) => {
	let warmed = false;
	const { root, policy, turn, run } = setup((event) => {
		if (warmed && failure === "result processing" && event.kind === "result")
			throw new Error("fixture result failure");
	});
	await run();
	warmed = true;
	expect(SandboxManager.cleanupAfterCommand).toHaveBeenCalledTimes(2);
	vi.mocked(SandboxManager.cleanupAfterCommand).mockClear();
	const realClose = fs.closeSync;
	const close = vi.spyOn(fs, "closeSync");
	if (failure === "async spawn") {
		vi.mocked(SandboxManager.wrapWithSandboxArgv).mockResolvedValueOnce({
			argv: [join(root, "absent-executable")],
			env: {},
		});
	} else if (failure === "sync helper fork") {
		vi.spyOn(childProcess, "fork").mockImplementationOnce(() => {
			throw new Error("fixture helper fork failure");
		});
	} else if (failure === "log open") {
		policy.close();
	} else if (failure === "log write") {
		vi.spyOn(fs, "writeSync").mockImplementationOnce(() => {
			throw new Error("fixture output failure");
		});
	} else if (failure === "log close") {
		close.mockImplementationOnce((fd) => {
			realClose(fd);
			throw new Error("fixture close failure");
		});
	} else if (failure === "stop before spawn") {
		vi.mocked(SandboxManager.wrapWithSandboxArgv).mockImplementationOnce(async () => {
			turn.stop();
			return { argv: ["/bin/true"], env: {} };
		});
	}
	await expect(run("printf output")).rejects.toThrow();
	expect(SandboxManager.cleanupAfterCommand).toHaveBeenCalledTimes(1);
	if (!["log open", "stop before spawn"].includes(failure)) expect(close).toHaveBeenCalledTimes(1);
});

it("does not release a wrapper that failed or a directly approved command", async () => {
	const { turn, run } = setup((event) => {
		if (event.kind === "asking") turn.answer(event.request, { kind: "allow" });
	});
	await run();
	vi.mocked(SandboxManager.cleanupAfterCommand).mockClear();
	vi.mocked(SandboxManager.wrapWithSandboxArgv).mockRejectedValueOnce(new Error("fixture wrap failure"));
	await run();
	expect(SandboxManager.cleanupAfterCommand).not.toHaveBeenCalled();
	turn.apply("bypass");
	await run();
	expect(SandboxManager.cleanupAfterCommand).not.toHaveBeenCalled();
});

it.each(["exit", "spawn", "wrapping"])(
	"releases only successfully prepared startup probes after %s failure",
	async (failure) => {
		if (failure === "wrapping")
			vi.mocked(SandboxManager.wrapWithSandboxArgv).mockRejectedValueOnce(new Error("fixture probe wrap failure"));
		else
			vi.mocked(SandboxManager.wrapWithSandboxArgv).mockResolvedValueOnce({
				argv: [failure === "exit" ? "/bin/false" : join(makeTempDir(), "missing-helper")],
				env: {},
			});
		const { turn, run } = setup((event) => {
			if (event.kind === "asking") turn.answer(event.request, { kind: "deny" });
		});
		await expect(run()).rejects.toThrow("Command denied");
		expect(SandboxManager.cleanupAfterCommand).toHaveBeenCalledTimes(failure === "wrapping" ? 0 : 1);
	},
);
