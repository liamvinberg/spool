import { spawn } from "node:child_process";
import type { AgentSpawn } from "./agent-spawn";

/**
 * The agent executor seam (#191), mirroring the terminal executor already on the
 * daemon app's options for exactly this reason: the turn runner takes its spawn
 * as input, so a fixture implementation replays a captured session line by line
 * and CI never spawns an agent, never touches a login, and never depends on a
 * model.
 *
 * One new option on an existing options object, not a new seam across the
 * codebase.
 */

export interface AgentProcess {
	/** one newline-terminated `stream-json` line down stdin */
	write(line: string): void;
	/** no more input is coming; the binary finishes and exits */
	end(): void;
	/** abandon the turn — the client went away, or the daemon is closing */
	kill(): void;
	onLine(cb: (line: string) => void): void;
	/** `code` is null when the process never started or died on a signal */
	onExit(cb: (code: number | null, message?: string) => void): void;
}

export type AgentExecutor = (options: AgentSpawn) => Promise<AgentProcess>;

/**
 * The real spawn: the developer's own binary, inheriting the daemon's
 * environment and reusing whatever login is already on the machine.
 *
 * `shell: false` is the default and stays that way — the prompt and the framing
 * both reach the child as argv, never through a shell that would parse them.
 */
export function claudeExecutor(): AgentExecutor {
	return async ({ command, args, cwd, env }) => {
		const child = spawn(command, [...args], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });

		let lineCb: (line: string) => void = () => {};
		let exitCb: (code: number | null, message?: string) => void = () => {};
		let exited = false;
		let buffer = "";
		const reportExit = (code: number | null, message?: string) => {
			if (exited) return;
			exited = true;
			exitCb(code, message);
		};

		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			buffer += chunk;
			// stream-json is newline-delimited and a single event can exceed one
			// chunk — a 150 KB screenshot always does
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (line.trim() !== "") lineCb(line);
			}
		});
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => process.stderr.write(chunk));
		// a write to a child that has already gone must not take the daemon with it
		child.stdin.on("error", () => {});
		child.on("exit", (code) => {
			if (buffer.trim() !== "") lineCb(buffer);
			buffer = "";
			reportExit(code);
		});
		// a missing binary lands here rather than on exit, and is the whole of
		// what "the agent is not installed" looks like from in here
		child.on("error", (error) => reportExit(null, error.message));

		return {
			write: (line) => {
				if (!exited) child.stdin.write(line);
			},
			end: () => {
				if (!exited) child.stdin.end();
			},
			kill: () => {
				child.stdin.end();
				child.kill();
			},
			onLine: (cb) => {
				lineCb = cb;
			},
			onExit: (cb) => {
				exitCb = cb;
			},
		};
	};
}
