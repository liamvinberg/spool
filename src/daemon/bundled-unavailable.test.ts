import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { expect, it, onTestFinished, vi } from "vitest";
import { makeTempDir, writeFrame } from "../test-helpers";
import type { AgentEvent } from "./agent-events";
import { closeBundledSandbox } from "./bundled-sandbox";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";

it.each(["missing helper", "kernel refusal"])(
	"explains %s before an actual unrestricted command, reuses only explicit broad grants and never auto-retries effects",
	async (failure) => {
		await closeBundledSandbox();
		const root = makeTempDir();
		writeFrame(root, "home", "export default () => <h1>Fixture</h1>");
		const directory = join(makeTempDir(), "bundled");
		if (failure === "missing helper")
			vi.spyOn(SandboxManager, "checkDependenciesAsync").mockResolvedValue({
				errors: ["Missing fixture helper"],
				warnings: [],
			});
		else {
			// The library produced argv, but the kernel rejects its startup probe. No user command ran.
			vi.spyOn(SandboxManager, "wrapWithSandboxArgv").mockResolvedValueOnce({ argv: ["/bin/false"], env: {} });
		}
		const runtime = await deterministicBundledRuntime(directory);
		await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
		onTestFinished(async () => {
			await runtime.close();
			await closeBundledSandbox();
			vi.restoreAllMocks();
		});
		const session = { id: randomUUID() };
		const events: AgentEvent[] = [];
		const run = async (id: string, command: string, reply: "allow" | "always" | "deny", other = session) => {
			await runtime.turn(
				id,
				{
					root,
					session: other,
					permissions: "edits",
					ask: { value: "openai/spool-test" },
					said: [
						{
							selection: "",
							prompt: `file tools: ${JSON.stringify([{ name: "bash", arguments: { command } }])}`,
						},
					],
				},
				(event) => {
					events.push(event);
					if (event.kind !== "asking") return;
					expect(event.access).toMatchObject({ kind: "command", unavailable: true, scope: "commands" });
					expect(event.description).toBe("Allow commands to read and change files your account can access?");
					expect(existsSync(join(root, id))).toBe(false);
					void runtime.request({ kind: "answer", turn: id, request: event.request, reply: { kind: reply } });
				},
			);
		};
		await run("denied", "printf no > denied", "deny");
		expect(existsSync(join(root, "denied"))).toBe(false);
		await run("once", "printf once > once; exit 9", "allow");
		expect(readFileSync(join(root, "once"), "utf8")).toBe("once");
		expect(events.filter((event) => event.kind === "asking")).toHaveLength(2);
		expect(events.filter((event) => event.kind === "result").at(-1)).toMatchObject({ failed: true });
		await run("grant", "printf yes > grant", "always");
		await run("reused", "printf yes > reused", "deny");
		expect(readFileSync(join(root, "reused"), "utf8")).toBe("yes");
		expect(events.filter((event) => event.kind === "asking")).toHaveLength(3);
		await run("other", "printf no > other", "deny", { id: randomUUID() });
		expect(existsSync(join(root, "other"))).toBe(false);
		expect(events.filter((event) => event.kind === "asking")).toHaveLength(4);
	},
);
