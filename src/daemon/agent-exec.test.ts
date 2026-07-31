import { describe, expect, it } from "vitest";
import { until } from "../test-helpers";
import { claudeExecutor } from "./agent-exec";

/**
 * The real spawn, on a command that is not the agent (#191, #200).
 *
 * What is tested here is the plumbing rather than the binary: that lines come back whole,
 * and that a refusal the agent *prints* rather than streams reaches the caller. That last
 * one is load-bearing for the rail — being signed out is answered by doing the thing
 * anyway, and the answer arrives on stderr and an exit code, so a runner that dropped
 * both would leave the log saying only that the process was gone.
 */

/** the executor, driven against a shell so nothing here depends on an installed agent */
function run(script: string) {
	return claudeExecutor()({ command: "sh", args: ["-c", script], cwd: process.cwd(), env: process.env });
}

function exited(proc: Awaited<ReturnType<typeof run>>) {
	return new Promise<{ code: number | null; message?: string; lines: string[] }>((resolve) => {
		const lines: string[] = [];
		proc.onLine((line) => lines.push(line));
		proc.onExit((code, message) => resolve({ code, ...(message === undefined ? {} : { message }), lines }));
	});
}

describe("the spawn's own plumbing", () => {
	it("hands every printed line over, and says nothing about a clean exit", async () => {
		const proc = await run('printf \'{"a":1}\\n{"b":2}\\n\'');

		const end = await exited(proc);

		expect(end.lines).toEqual(['{"a":1}', '{"b":2}']);
		expect(end.code).toBe(0);
		// a successful run's stderr is warnings rather than a reason, so it is not a message
		expect(end.message).toBeUndefined();
	});

	/** the binary's own words for a login that is not there, which is how the rail hears it */
	it("carries what the agent printed on a failed exit", async () => {
		const proc = await run('echo "Not logged in · Please run /login" >&2; exit 1');

		const end = await exited(proc);

		expect(end.code).toBe(1);
		expect(end.message).toBe("Not logged in · Please run /login");
	});

	it("says a missing binary is missing rather than crashing the daemon", async () => {
		const proc = await claudeExecutor()({
			command: "spool-agent-that-does-not-exist",
			args: [],
			cwd: process.cwd(),
			env: process.env,
		});

		const end = await exited(proc);

		expect(end.code).toBeNull();
		expect(end.message).toContain("ENOENT");
	});

	/**
	 * Everything the process printed, and then the exit — in that order (#191).
	 *
	 * The exit event fires when the process goes, which is not when its pipes are empty:
	 * a binary that prints its `result` and exits in the same breath leaves the last of it
	 * in a buffer the daemon has not read yet. Reported on the exit, a turn that finished
	 * cleanly loses its ending and the rail draws it as one that was cut, so the report
	 * waits for the close.
	 */
	it("hands over the last of what a process printed before saying it is gone", async () => {
		const proc = await run('i=0; while [ $i -lt 4000 ]; do printf \'{"n":%s}\\n\' "$i"; i=$((i+1)); done; exit 3');

		const end = await exited(proc);

		expect(end.lines).toHaveLength(4000);
		expect(end.lines.at(-1)).toBe('{"n":3999}');
		expect(end.code).toBe(3);
	});
});

/**
 * What a kill has to reach (#191).
 *
 * A turn is a process tree rather than a process: the binary runs Bash, Bash starts a dev
 * server, and the pid spool holds is the one at the top. So the kill addresses the group
 * the spawn made, and it does not take no for an answer — the first signal is a request,
 * and the second one is not.
 */
describe("giving a process up", () => {
	/** whether that pid is still something this machine would signal */
	const alive = (pid: number): boolean => {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	};

	it("takes what the process started with it, not only the process", async () => {
		// the shape of the thing being killed: a child of the child, which is what a dev
		// server the agent left running under Bash is
		const proc = await run('sleep 30 & printf \'{"pid":%s}\\n\' "$!"; wait');
		const grandchild = await new Promise<number>((resolve) => {
			proc.onLine((line) => resolve((JSON.parse(line) as { pid: number }).pid));
		});
		expect(alive(grandchild)).toBe(true);

		proc.kill();

		await until(() => !alive(grandchild));
	});

	it("stops asking a process that will not go, and makes it go", async () => {
		// a binary that sits through the polite one. Every `sleep` the loop starts is its
		// own process and the group signal reaches those, so the shell alone survives it
		const proc = await run('trap "" TERM; while true; do sleep 0.2; done');
		const end = exited(proc);
		// it is really up and really ignoring it: a term now changes nothing
		await new Promise((resolve) => setTimeout(resolve, 200));

		proc.kill();

		// null is the code of a process that died on a signal, which is the only way this
		// one was ever going to
		expect((await end).code).toBeNull();
	}, 10_000);
});
