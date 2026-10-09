import { describe, expect, it } from "vitest";
import {
	CODEX_MODES,
	codexFraming,
	codexInstructions,
	planCodexSpawn,
	versionAtLeast,
	versionIn,
} from "./agent-codex-spawn";

describe("codex's spawn", () => {
	it("runs in the project with loopback open, and leaves the project's trust to the person", () => {
		const spawn = planCodexSpawn('/work/my "app"', {}, {});
		expect(spawn.args).toContain("sandbox_workspace_write.network_access=true");
		expect(spawn.args.some((arg) => arg.startsWith("projects"))).toBe(false);
		expect(spawn.cwd).toBe('/work/my "app"');
	});

	it("overrides none of the person's own developer instructions on the command line", () => {
		expect(planCodexSpawn("/p", {}, {}).args.some((arg) => arg.startsWith("developer_instructions"))).toBe(false);
	});

	it("adds spool's framing after the person's own developer instructions", () => {
		expect(codexInstructions("Answer in Swedish.", "edits")).toBe(`Answer in Swedish.\n\n${codexFraming()}`);
		expect(codexInstructions(undefined, "edits")).toBe(codexFraming());
		expect(codexInstructions("  ", "ask")).toBe(codexFraming());
		const bypass = codexInstructions("Mine.", "bypass");
		expect(bypass.startsWith("Mine.\n\nApprovals are off")).toBe(true);
		expect(bypass.endsWith(codexFraming())).toBe(true);
	});

	it("maps each mode to Codex's own approval policy and sandbox", () => {
		expect(CODEX_MODES).toMatchObject({
			ask: { approvalPolicy: "untrusted", sandbox: "workspace-write" },
			edits: { approvalPolicy: "on-request", sandbox: "workspace-write" },
			bypass: { approvalPolicy: "never", sandbox: "danger-full-access" },
		});
	});

	it("reads and compares Codex's version", () => {
		expect(versionIn("codex-cli 0.161.0\n")).toBe("0.161.0");
		expect(versionAtLeast("0.161.0", "0.157.0")).toBe(true);
		expect(versionAtLeast("0.157.0", "0.157.0")).toBe(true);
		expect(versionAtLeast("0.99.9", "0.157.0")).toBe(false);
		expect(versionAtLeast("1.0.0", "0.157.0")).toBe(true);
	});
});
