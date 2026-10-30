import { describe, expect, it, vi } from "vitest";
import { fullCiVerdict, NO_RUN_MS, TransientLookupError, UNREACHABLE_MS, waitForCi } from "./wait-for-ci.ts";

const sha = "a".repeat(40);
const passed = { id: 10, head_sha: sha, event: "push", status: "completed", conclusion: "success" };
const fullGate = async () => [{ name: "gates", conclusion: "success" }];

describe("release CI prerequisite", () => {
	it("waits for the release commit even when another revision or a PR passed", async () => {
		const jobs = vi.fn(fullGate);
		const verdict = await fullCiVerdict(
			sha,
			[
				{ ...passed, head_sha: "b".repeat(40) },
				{ ...passed, event: "pull_request" },
			],
			jobs,
		);
		expect(verdict.state).toBe("waiting");
		expect(jobs).not.toHaveBeenCalled();
	});

	it("waits for a newer run and refuses a newer failure over an earlier pass", async () => {
		for (const [status, conclusion, expected] of [
			["in_progress", null, "waiting"],
			["completed", "failure", "failed"],
			["completed", "cancelled", "failed"],
		] as const) {
			const verdict = await fullCiVerdict(sha, [passed, { ...passed, id: 11, status, conclusion }], fullGate);
			expect(verdict.state).toBe(expected);
		}
	});

	it("refuses a green workflow that skipped the full test suite", async () => {
		for (const jobs of [
			[],
			[{ name: "gates", conclusion: "skipped" }],
			[{ name: "design", conclusion: "success" }],
		]) {
			expect((await fullCiVerdict(sha, [passed], async () => jobs)).state).toBe("failed");
		}
	});

	it("accepts successful full push and manual recovery runs on the exact commit", async () => {
		for (const event of ["push", "workflow_dispatch"]) {
			expect((await fullCiVerdict(sha, [{ ...passed, event }], fullGate)).state).toBe("success");
		}
	});

	/** A wait on a fake clock: each answer is what GitHub says at that poll. */
	function waitOn(answers: ((path: string) => unknown)[]) {
		let clock = 0;
		let poll = 0;
		const log: string[] = [];
		const wait = waitForCi(sha, {
			request: async <T>(path: string) => {
				const answer = (answers[Math.min(poll, answers.length - 1)] ?? (() => undefined))(path);
				if (answer instanceof Error) throw answer;
				return answer as T;
			},
			sleep: async (ms) => {
				clock += ms;
				poll += 1;
			},
			now: () => clock,
			log: (message) => log.push(message),
		});
		return { wait, log, minutes: () => clock / 60_000 };
	}
	const runs =
		(...list: object[]) =>
		(path: string) =>
			path.includes("/jobs") ? { jobs: [{ name: "gates", conclusion: "success" }] } : { workflow_runs: list };
	const blip = () => new TransientLookupError("GitHub CI lookup returned HTTP 502.");

	it("waits out a CI run however long it takes, and GitHub's blips on the way", async () => {
		const running = runs({ ...passed, status: "in_progress", conclusion: null });
		const { wait, log, minutes } = waitOn([
			...Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? blip : running)),
			runs(passed),
		]);
		await expect(wait).resolves.toBeUndefined();
		expect(minutes()).toBe(50);
		expect(log.at(-1)).toBe(`Full CI passed on ${sha} in run 10.`);
	});

	it("gives up on a CI run that never starts, or on GitHub staying unreachable", async () => {
		const none = waitOn([runs()]);
		await expect(none.wait).rejects.toThrow(/No CI run started/);
		expect(none.minutes()).toBe(NO_RUN_MS / 60_000);
		const down = waitOn([blip]);
		await expect(down.wait).rejects.toThrow(/kept failing/);
		expect(down.minutes()).toBe(UNREACHABLE_MS / 60_000);
	});

	it("fails at once on an answer that asking again won't change", async () => {
		const { wait, minutes } = waitOn([() => new Error("GitHub CI lookup returned HTTP 404.")]);
		await expect(wait).rejects.toThrow("HTTP 404");
		expect(minutes()).toBe(0);
	});
});
