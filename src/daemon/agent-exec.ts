import { spawn } from "node:child_process";
import type { AgentSpawn } from "./agent-spawn";

/**
 * The agent executor seam (#191), on the daemon app's options for exactly this
 * reason: the turn runner takes its spawn as input, so a fixture implementation
 * replays a captured session line by line
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
	/** give the process up — the daemon let the turn go, or it outstayed its own ending */
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
 * same four ways to be over and want it to happen once: the process exited, the caller
 * has heard enough, the binary has had long enough, or nobody is waiting for the answer
 * any more. So the lifecycle lives here, beside the process it is about, and each probe
 * supplies only its own conversation.
 *
 * The timeout is the backstop rather than the plan. Every caller closes stdin, so the
 * binary exits on its own and `onExit` is what normally ends this.
 *
 * A probe is asked by one request and by nothing else, so the request going away is the
 * end of it: a menu that was opened and closed, or a page that was navigated off, would
 * otherwise leave a whole binary running for its full timeout with nobody to hear it.
 */
export async function probeAgent(
	proc: AgentProcess,
	timeoutMs: number,
	/** what to ask, and when the answer is complete: `finish` ends the probe early */
	ask: (finish: () => void) => void,
	/** the request that wanted the answer, so a client that left takes the process with it */
	signal?: AbortSignal,
): Promise<void> {
	let settled = false;
	await new Promise<void>((resolve) => {
		const done = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", done);
			proc.kill();
			resolve();
		};
		const timer = setTimeout(done, timeoutMs);
		proc.onExit(done);
		// already gone: the question is not asked at all, because asking it is what would
		// give the process something to do
		if (signal?.aborted === true) {
			done();
			return;
		}
		signal?.addEventListener("abort", done);
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
 * How long the asked-for way out gets before it stops being a request.
 *
 * Three seconds, the grace a supervisor gives a process, for the same reason:
 * a process that has been asked to go and has not is not going to, and what it is
 * holding — a port, a lock, a repo — is held against everybody.
 */
const HARD_KILL_MS = 3000;

/**
 * The real spawn: the developer's own binary, inheriting the daemon's
 * environment and reusing whatever login is already on the machine.
 *
 * `shell: false` is the default and stays that way — the prompt and the framing
 * both reach the child as argv, never through a shell that would parse them.
 *
 * It is spawned into its own process group, because the binary is not the only process
 * a turn makes: an agent that ran a dev server under Bash left it a grandchild, and a
 * signal addressed to the one pid spool knows about walked past it. The group is what
 * spool started, so the group is what spool takes back. Windows has no such thing to
 * address — `detached` there is a console window per turn — so the flag stops at the
 * platform that means something by it.
 */
export function claudeExecutor(): AgentExecutor {
	return async ({ command, args, cwd, env }) => {
		const child = spawn(command, [...args], {
			cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});

		let lineCb: (line: string) => void = () => {};
		let exitCb: (code: number | null, message?: string) => void = () => {};
		let exited = false;
		let buffer = "";
		/** the tail of what it printed, which is where a refusal it does not stream lands */
		let said = "";
		/** the signal a request that was not honoured comes due as, cancelled by the exit */
		let hardKill: ReturnType<typeof setTimeout> | undefined;
		const reportExit = (code: number | null, message?: string) => {
			if (hardKill !== undefined) clearTimeout(hardKill);
			if (exited) return;
			exited = true;
			exitCb(code, message);
		};
		/**
		 * One signal, addressed to the whole group.
		 *
		 * The negative pid is the group this child leads, which is where everything it
		 * started lives. The fallback is the child alone, for the machines and the moments
		 * where there is no group to name: Windows has none, and a group that is already
		 * gone throws rather than answering.
		 */
		const signalGroup = (signal: NodeJS.Signals): void => {
			const pid = child.pid;
			if (pid === undefined) return;
			try {
				process.kill(-pid, signal);
			} catch {
				child.kill(signal);
			}
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
		/*
		 * And neither must a read of one.
		 *
		 * A `data` listener with no `error` beside it is an unhandled error event, which
		 * node throws out of the stream and nothing here catches: one broken pipe on one
		 * child's stdout takes the daemon down, and every other project's turn with it. It
		 * lands where a spawn that never started lands, because from up here the two are
		 * the same fact — there is no process left to read.
		 */
		child.stdout.on("error", (error: Error) => reportExit(null, error.message));
		child.stderr.on("error", (error: Error) => reportExit(null, error.message));
		// `close` rather than `exit`: the exit is the process going, and the pipes can
		// still be holding the last thing it said. A turn's final `result` arriving after
		// its own exit would be dropped, and a turn that finished cleanly would read as one
		// that was cut
		child.on("close", (code) => {
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
				// closing stdin is the clean way out and the signal is the same request by
				// other means; the second one is not a request. A binary that sat through the
				// first — wedged, or deep in a tool call nobody is reading — is a process
				// standing in a repo on behalf of nobody
				child.stdin.end();
				signalGroup("SIGTERM");
				hardKill ??= setTimeout(() => signalGroup("SIGKILL"), HARD_KILL_MS);
				hardKill.unref?.();
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
