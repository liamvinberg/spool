import { describe, expect, it, vi } from "vitest";
import { fullCiVerdict } from "./wait-for-ci.ts";

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
});
