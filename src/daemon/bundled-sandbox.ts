import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, openSync, writeSync } from "node:fs";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";

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
				{
					filesystem: { allowWrite: [], denyRead: [], denyWrite: [] },
					network: { allowedDomains: ["*"], deniedDomains: [] },
				},
				undefined,
				false,
			);
			// A helper can exist while the kernel refuses its isolation primitives. Probe
			// before the user's command, whose partial effects must never be retried.
			stage = "probe wrapping";
			const probe = await SandboxManager.wrapWithSandboxArgv("true", "/bin/bash");
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
		} catch (error) {
			throw new Error(`Command isolation is unavailable (${stage})`, { cause: error });
		}
	})();
	await ready;
	return SandboxManager.wrapWithSandboxArgv(command, "/bin/bash", { filesystem }, signal, root, {
		commandId: randomUUID(),
	});
}

/** Commands own a process group, including browser children. Completion retires that group too. */
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
		const child = spawn(executable, argv.slice(1), { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
		let text = "";
		let stdout = "";
		let stopped = false;
		const kill = () => {
			if (child.pid === undefined) return;
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
		};
		const stop = () => {
			stopped = true;
			kill();
		};
		const timer = setTimeout(stop, timeout * 1000);
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
		child.stdout.on("data", (data: Buffer) => collect(data, true));
		child.stderr.on("data", (data: Buffer) => collect(data, false));
		child.on("error", reject);
		child.on("exit", kill);
		child.on("close", (code) => {
			clearTimeout(timer);
			if (outputFd !== undefined) closeSync(outputFd);
			if (total > 200_000) text = `[Output truncated; full output: ${outputFile ?? "not saved"}]\n${text}`;
			signal.removeEventListener("abort", stop);
			if (outputError !== undefined) reject(new Error("Could not save command output", { cause: outputError }));
			else if (stopped) reject(new Error(signal.aborted ? "Command stopped" : "Command timed out"));
			else resolve({ code, text, stdout });
		});
	});
}

export async function closeBundledSandbox(): Promise<void> {
	await ready?.catch(() => {});
	await SandboxManager.reset();
	ready = undefined;
}
