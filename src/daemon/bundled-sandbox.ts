import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, openSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SandboxManager, SandboxRuntimeConfigSchema } from "@anthropic-ai/sandbox-runtime";
import type { CommandResult, CommandStart } from "./bundled-command-process";

// One immutable host configuration. Every command supplies its own filesystem policy.
let ready: Promise<void> | undefined;
export async function sandboxCommand(
	command: string,
	root: string,
	filesystem: { allowWrite: string[]; denyRead: string[]; denyWrite: string[] },
	signal: AbortSignal,
) {
	ready ??= (async () => {
		let stage = "platform";
		try {
			if (!SandboxManager.isSupportedPlatform() || process.platform === "win32")
				throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
			stage = "dependencies";
			const dependencies = await SandboxManager.checkDependenciesAsync();
			if (dependencies.errors.length) throw new Error([...dependencies.errors, ...dependencies.warnings].join("\n"));
			stage = "initialization";
			await SandboxManager.initialize(
				SandboxRuntimeConfigSchema.parse({
					filesystem: { allowWrite: [], denyRead: [], denyWrite: [] },
					network: { allowedDomains: [], deniedDomains: [] },
				}),
				// Ordinary outbound access is quiet. The supported callback allows
				// destinations through the proxy without weakening filesystem isolation.
				async () => true,
				false,
			);
			// A helper can exist while the kernel refuses its isolation primitives. Probe
			// before the user's command, whose partial effects must never be retried.
			stage = "probe wrapping";
			const probe = await SandboxManager.wrapWithSandboxArgv("true", "/bin/bash");
			try {
				stage = "probe execution";
				const result = await runCommand(
					probe.argv,
					process.cwd(),
					{ PATH: process.env.PATH, ...probe.env },
					new AbortController().signal,
					10,
				);
				// Only the fixed startup probe's bounded output belongs in diagnostics.
				// Never record a user's command, its environment, or the generated sandbox argv.
				if (result.code !== 0) throw new Error(`Startup probe exited ${result.code}: ${result.text.slice(-4096)}`);
			} finally {
				SandboxManager.cleanupAfterCommand();
			}
		} catch (error) {
			throw new Error(`Command isolation is unavailable (${stage})`, { cause: error });
		}
	})();
	await ready;
	const wrapped = await SandboxManager.wrapWithSandboxArgv(command, "/bin/bash", { filesystem }, signal, root, {
		commandId: randomUUID(),
	});
	let released = false;
	return {
		...wrapped,
		// Release only after execution settles. The runtime defers removing Linux
		// mount points until every prepared command has released its ownership.
		cleanup: () => {
			if (released) return;
			released = true;
			SandboxManager.cleanupAfterCommand();
		},
	};
}

/** A separate owner retires the command group even if this host disappears. */
export async function runCommand(
	argv: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
	signal: AbortSignal,
	timeout: number,
	outputFile?: string,
): Promise<{ code: number | null; text: string; stdout: string }> {
	if (signal.aborted) throw new Error("Command stopped");
	const executable = argv[0];
	if (!executable) throw new Error("No command to execute");
	return new Promise((resolve, reject) => {
		const outputFd = outputFile === undefined ? undefined : openSync(outputFile, "wx", 0o600);
		let total = 0;
		let outputError: unknown;
		let child: ReturnType<typeof fork>;
		try {
			const source = import.meta.url.endsWith(".ts");
			child = fork(
				fileURLToPath(
					new URL(source ? "./bundled-command-process.ts" : "./bundled-command-process.js", import.meta.url),
				),
				[],
				{
					cwd,
					env: { PATH: process.env.PATH, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}) },
					execArgv: source ? ["--import", import.meta.resolve("tsx")] : [],
					stdio: ["ignore", "pipe", "pipe", "ipc"],
				},
			);
		} catch (error) {
			if (outputFd !== undefined) closeSync(outputFd);
			throw error;
		}
		let spawnError: Error | undefined;
		let text = "";
		let stdout = "";
		let result: CommandResult | undefined;
		let spawned = false;
		let stopRequested = false;
		const stop = () => {
			stopRequested = true;
			if (spawned && child.connected) child.send({ kind: "stop" }, () => {});
		};
		signal.addEventListener("abort", stop, { once: true });
		const collect = (data: Buffer, output: boolean) => {
			// Bounded results prevent an accidental endless producer exhausting the host.
			if (outputFd !== undefined) {
				try {
					writeSync(outputFd, data);
				} catch (error) {
					outputError = error;
					stop();
					return;
				}
			}
			total += data.length;
			const chunk = data.toString();
			text = (text + chunk).slice(-200_000);
			if (output) stdout = (stdout + chunk).slice(-200_000);
		};
		child.stdout?.on("data", (data: Buffer) => collect(data, true));
		child.stderr?.on("data", (data: Buffer) => collect(data, false));
		// Even a failed spawn emits close. Settle there so callers can safely
		// release sandbox ownership and all per-process resources together.
		child.on("error", (error) => {
			spawnError = error;
			if (spawned && child.connected) child.disconnect();
		});
		child.on("message", (message: CommandResult) => {
			result = message;
		});
		child.on("close", () => {
			if (outputFd !== undefined) {
				try {
					closeSync(outputFd);
				} catch (error) {
					outputError ??= error;
				}
			}
			if (total > 200_000) text = `[Output truncated; full output: ${outputFile ?? "not saved"}]\n${text}`;
			signal.removeEventListener("abort", stop);
			if (spawnError) reject(spawnError);
			else if (outputError !== undefined) reject(new Error("Could not save command output", { cause: outputError }));
			else if (result?.error) reject(new Error(result.error));
			else if (signal.aborted || result?.stopped)
				reject(new Error(signal.aborted ? "Command stopped" : "Command timed out"));
			else if (result === undefined) reject(new Error("The command process stopped unexpectedly"));
			else resolve({ code: result.code, text, stdout });
		});
		child.on("spawn", () => {
			spawned = true;
			if (signal.aborted || stopRequested) {
				stop();
				return;
			}
			const request: CommandStart = { kind: "start", argv, cwd, env, timeout };
			child.send(request, (error) => {
				if (error) {
					spawnError = error;
					if (child.connected) child.disconnect();
				}
			});
		});
	});
}

export async function closeBundledSandbox(): Promise<void> {
	await ready?.catch(() => {});
	await SandboxManager.reset();
	ready = undefined;
}
