import { describe, expect, it } from "vitest";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { MachineAgent, SetupJob } from "../../daemon/agent-setup";
import { agentsContinue, agentsHeadline, rowAction } from "./steps";

function agent(id: AgentEngineId, at: Partial<MachineAgent> = {}): MachineAgent {
	return {
		id,
		installed: false,
		outdated: false,
		signedIn: false,
		account: null,
		install: { line: `install ${id}`, unattended: true },
		signIn: { line: `${id} login`, unattended: id !== "pi" },
		job: null,
		...at,
	};
}
const running = (kind: SetupJob["kind"]): SetupJob =>
	kind === "install"
		? { kind, state: "running", lines: [] }
		: { kind, state: "running", lines: [], url: null, asksCode: false };

describe("return on an agent's row", () => {
	it("installs, then signs in, then goes on", () => {
		const claude = agent("claude");
		expect(rowAction(claude, [claude])).toEqual({ kind: "install", label: "Install Claude Code", can: true });
		const installed = agent("claude", { installed: true });
		expect(rowAction(installed, [installed])).toEqual({
			kind: "sign-in",
			label: "Sign in to Claude Code",
			can: true,
		});
		const ready = agent("claude", { installed: true, signedIn: true });
		expect(rowAction(ready, [ready])).toBeNull();
		// too old to run is installed again, which updates it
		const old = agent("codex", { installed: true, signedIn: true, outdated: true });
		expect(rowAction(old, [old])).toMatchObject({ kind: "install", label: "Update Codex" });
	});

	it("waits while something runs, and starts no second install beside one", () => {
		const claude = agent("claude", { job: running("install") });
		const codex = agent("codex");
		expect(rowAction(claude, [claude, codex])).toEqual({ kind: "wait", label: "Installing Claude Code" });
		expect(rowAction(codex, [claude, codex])).toMatchObject({ kind: "install", can: false });
		const signing = agent("codex", { installed: true, job: running("sign-in") });
		expect(rowAction(signing, [signing])).toEqual({ kind: "wait", label: "Waiting for the browser" });
	});

	it("hands over the line where spool can't run it, and pi's page once pi is here", () => {
		const bare = agent("pi", { install: { line: "npm install -g pi", unattended: false } });
		expect(rowAction(bare, [bare])).toEqual({
			kind: "copy",
			label: "Copy the install line",
			line: "npm install -g pi",
		});
		const pi = agent("pi", { installed: true });
		expect(rowAction(pi, [pi])).toEqual({ kind: "pi", label: "Choose a provider" });
	});
});

describe("what the agents step says", () => {
	it("tells set up from found, and holds Continue while an install runs", () => {
		const fresh = [agent("claude"), agent("codex")];
		expect(agentsHeadline(fresh, []).title).toBe("Connect your agent.");
		const ready = [
			agent("claude", { installed: true, signedIn: true }),
			agent("codex", { installed: true, signedIn: true }),
		];
		expect(agentsHeadline(ready, ["claude", "codex"])).toEqual({
			title: "Your agents are already here.",
			body: "spool found Claude Code and Codex on this computer, signed in.",
		});
		expect(agentsHeadline(ready, []).title).toBe("Claude Code is ready.");
		expect(agentsContinue([ready[0] as MachineAgent, agent("pi", { job: running("install") })])).toEqual({
			label: "Continue with Claude Code",
			can: false,
		});
	});
});
