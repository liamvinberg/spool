import { once } from "node:events";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { SandboxManager, SandboxRuntimeConfigSchema } from "@anthropic-ai/sandbox-runtime";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
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
	const cleanup = vi.spyOn(SandboxManager, "cleanupAfterCommand");
	const wrapped = await prepare();
	expect(cleanup).toHaveBeenCalledTimes(1);
	expect(SandboxRuntimeConfigSchema.safeParse(SandboxManager.getConfig()).success).toBe(true);
	const result = await runCommand(
		wrapped.argv,
		process.cwd(),
		{ PATH: process.env.PATH, ...wrapped.env },
		new AbortController().signal,
		10,
	).finally(wrapped.cleanup);
	expect(result, "the actual prepared sandbox must execute successfully").toMatchObject({ code: 0 });
	expect(cleanup).toHaveBeenCalledTimes(2);
	wrapped.cleanup();
	expect(cleanup).toHaveBeenCalledTimes(2);
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

it("allows an actual HTTP request through the sandbox proxy without a domain prompt", async () => {
	const server = createServer((_request, response) => response.end("fixture outbound response"));
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing fixture server address");
	const wrapped = await sandboxCommand(
		`curl --noproxy '' --silent --show-error --fail --max-time 5 http://127.0.0.1:${address.port}/`,
		makeTempDir(),
		filesystem,
		new AbortController().signal,
	);
	const result = await runCommand(
		wrapped.argv,
		process.cwd(),
		{ PATH: process.env.PATH, ...wrapped.env },
		new AbortController().signal,
		10,
	).finally(wrapped.cleanup);
	expect(result).toMatchObject({ code: 0, stdout: "fixture outbound response" });
}, 30_000);

it("removes actual empty mount points for absent protected leaves and intermediate directories after failure", async () => {
	const root = realpathSync(makeTempDir());
	const leaf = join(root, "protected.json");
	const nested = join(root, "missing", "protected.json");
	const wrapped = await sandboxCommand(
		"printf denied > protected.json; printf denied > missing/protected.json",
		root,
		{ allowWrite: [root], denyRead: [], denyWrite: [leaf, nested] },
		new AbortController().signal,
	);
	const result = await runCommand(
		wrapped.argv,
		root,
		{ PATH: process.env.PATH, ...wrapped.env },
		new AbortController().signal,
		10,
	).finally(wrapped.cleanup);
	expect(result.code, result.text).not.toBe(0);
	for (const path of [leaf, nested]) {
		const content = existsSync(path) ? readFileSync(path, "utf8") : "";
		expect(content).not.toContain("denied");
		expect(existsSync(path)).toBe(false);
	}
	expect(existsSync(join(root, "missing"))).toBe(false);
}, 30_000);
