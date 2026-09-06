import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { afterEach, expect, it, vi } from "vitest";
import { makeTempDir } from "../test-helpers";
import { closeBundledSandbox, runCommand, sandboxCommand } from "./bundled-sandbox";

const filesystem = { allowWrite: [], denyRead: [], denyWrite: [] };
const prepare = () => sandboxCommand("true", makeTempDir(), filesystem, new AbortController().signal);

afterEach(async () => {
	await closeBundledSandbox();
	vi.restoreAllMocks();
});

it("starts the actual command sandbox with the product policy", async () => {
	// Fail with the startup stage and cause before unavailable fallback hides it.
	// This must run on CI's real platform, with no mock, skip, or broader retry.
	const wrapped = await prepare();
	const result = await runCommand(
		wrapped.argv,
		process.cwd(),
		{ PATH: process.env.PATH, ...wrapped.env },
		new AbortController().signal,
		10,
	);
	expect(result, "the actual prepared sandbox must execute successfully").toMatchObject({ code: 0 });
}, 30_000);

it("retains missing dependency evidence without starting a command", async () => {
	vi.spyOn(SandboxManager, "checkDependenciesAsync").mockResolvedValue({
		errors: ["Missing fixture helper"],
		warnings: ["Fixture warning"],
	});
	const wrap = vi.spyOn(SandboxManager, "wrapWithSandboxArgv");
	await expect(prepare()).rejects.toMatchObject({
		message: "Command isolation is unavailable (dependencies)",
		cause: { message: "Missing fixture helper\nFixture warning" },
	});
	expect(wrap).not.toHaveBeenCalled();
});

it("retains a failed harmless startup probe's exit code and stderr", async () => {
	vi.spyOn(SandboxManager, "wrapWithSandboxArgv").mockResolvedValueOnce({
		argv: ["/bin/bash", "-c", "printf 'fixture kernel refusal' >&2; exit 23"],
		env: {},
	});
	await expect(prepare()).rejects.toMatchObject({
		message: "Command isolation is unavailable (probe execution)",
		cause: { message: "Startup probe exited 23: fixture kernel refusal" },
	});
});
