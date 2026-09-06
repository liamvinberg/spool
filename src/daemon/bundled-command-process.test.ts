import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished, vi } from "vitest";
import { makeTempDir } from "../test-helpers";
import type { CommandStart } from "./bundled-command-process";
import { runCommand } from "./bundled-sandbox";

it("settles helper and command startup failures without executing or replaying", async () => {
	const root = makeTempDir();
	const signal = new AbortController().signal;
	await expect(runCommand(["/bin/echo", "unreachable"], join(root, "absent"), {}, signal, 5)).rejects.toThrow();
	await expect(runCommand([join(root, "no-executable")], root, {}, signal, 5)).rejects.toThrow(/ENOENT/);
	const aborted = new AbortController();
	aborted.abort();
	await expect(runCommand(["/usr/bin/touch", "effect"], root, {}, aborted.signal, 5)).rejects.toThrow(
		"Command stopped",
	);
	expect(existsSync(join(root, "effect"))).toBe(false);
});

it.each(["disconnect", "stop"])("never starts a command after early helper %s", async (loss) => {
	const root = makeTempDir();
	const child = fork(fileURLToPath(new URL("./bundled-command-process.ts", import.meta.url)), [], {
		cwd: root,
		env: { PATH: process.env.PATH },
		execArgv: ["--import", import.meta.resolve("tsx")],
		stdio: ["ignore", "ignore", "ignore", "ipc"],
	});
	onTestFinished(() => {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	});
	const exited = once(child, "exit");
	if (loss === "disconnect") child.disconnect();
	else {
		child.send({ kind: "stop" });
		const start: CommandStart = { kind: "start", argv: ["/usr/bin/touch", "effect"], cwd: root, env: {}, timeout: 5 };
		child.send(start, () => {});
	}
	await exited;
	expect(existsSync(join(root, "effect"))).toBe(false);
});

it("settles abort during helper startup and keeps ambient Node flags out", async () => {
	const root = makeTempDir();
	vi.stubEnv("NODE_OPTIONS", "--require /does-not-exist/ambient-hook.cjs");
	onTestFinished(() => {
		vi.unstubAllEnvs();
	});
	const controller = new AbortController();
	const run = runCommand(["/bin/bash", "-c", "sleep 10; touch effect"], root, {}, controller.signal, 20);
	controller.abort();
	await expect(run).rejects.toThrow("Command stopped");
	expect(existsSync(join(root, "effect"))).toBe(false);
	const result = await runCommand(["/bin/echo", "one execution"], root, {}, new AbortController().signal, 5);
	expect(result).toMatchObject({ code: 0, stdout: "one execution\n" });
});
