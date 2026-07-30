import { describe, expect, it } from "vitest";
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
});
