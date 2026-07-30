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
 * One probe, run to completion (#199, #201).
 *
 * A probe is not a turn: it asks the binary a question about itself, reads the answer and
 * ends. Both of them — what the model menu may offer, and whose login this is — want the
 * same three ways to be over and want it to happen once: the process exited, the caller
 * has heard enough, or the binary has had long enough. So the lifecycle lives here, beside
 * the process it is about, and each probe supplies only its own conversation.
 *
 * The timeout is the backstop rather than the plan. Every caller closes stdin, so the
 * binary exits on its own and `onExit` is what normally ends this.
 */
export async function probeAgent(
	proc: AgentProcess,
	timeoutMs: number,
	/** what to ask, and when the answer is complete: `finish` ends the probe early */
	ask: (finish: () => void) => void,
): Promise<void> {
	let settled = false;
	await new Promise<void>((resolve) => {
		const done = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			proc.kill();
			resolve();
		};
		const timer = setTimeout(done, timeoutMs);
		proc.onExit(done);
		ask(done);
	});
}

/**
 * How much of what the binary printed is kept for the exit message.
 *
 * Enough for a refusal and its remedy — the longest of the binary's own is under a
 * hundred characters — and not a transcript of a crash, because it becomes one line in a
 * log the rail draws.
 */
const STDERR_KEPT = 400;

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
		/** the tail of what it printed, which is where a refusal it does not stream lands */
		let said = "";
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
		/*
		 * What the binary said on its way out, kept so the rail can draw it (#127, #200).
		 *
		 * A refusal it prints rather than streams — `Not logged in`, `Please run /login` —
		 * reaches nobody otherwise: stderr goes to the daemon's log, which is not where the
		 * person is looking, and the exit alone is a code with no words. It is reported only
		 * on a non-zero exit, because a successful run's stderr is warnings rather than a
		 * reason, and it is bounded because it goes in a log line.
		 */
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			process.stderr.write(chunk);
			said = `${said}${chunk}`.slice(-STDERR_KEPT);
		});
		// a write to a child that has already gone must not take the daemon with it
		child.stdin.on("error", () => {});
		child.on("exit", (code) => {
			if (buffer.trim() !== "") lineCb(buffer);
			buffer = "";
			const words = said.trim();
			reportExit(code, code !== 0 && words !== "" ? words : undefined);
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
