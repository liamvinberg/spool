import { expect, it } from "vitest";
import { CheckSourceBudget, CheckSourceLimitError, type CheckSourceLimits } from "./check-budget";

const limits: CheckSourceLimits = {
	maxFileBytes: 4,
	maxTotalBytes: 8,
	maxFiles: 2,
	maxAliases: 3,
};

it("accepts source usage exactly at every offline-check limit", () => {
	const budget = new CheckSourceBudget(limits);

	expect(() => {
		budget.reserve("first.ts", 4);
		budget.reserve("second.ts", 4);
	}).not.toThrow();
});

it("accounts for the latest actual byte count when a source is read again", () => {
	const budget = new CheckSourceBudget(limits);
	budget.reserve("first.ts", 2);
	budget.reserve("second.ts", 4);

	expect(() => budget.reserve("first.ts", 4)).not.toThrow();
	expect(() => budget.reserve("first.ts", 5)).toThrow(CheckSourceLimitError);
});

it.each([
	["per-file bytes", [["large.ts", 5]]],
	[
		"total bytes",
		[
			["first.ts", 4],
			["second.ts", 4],
			["third.ts", 1],
		],
	],
	[
		"file count",
		[
			["first.ts", 1],
			["second.ts", 1],
			["third.ts", 1],
		],
	],
] as const)("rejects source usage over the %s limit", (_, reservations) => {
	const budget = new CheckSourceBudget(limits);
	let failure: unknown;

	try {
		for (const [file, bytes] of reservations) budget.reserve(file, bytes);
	} catch (error) {
		failure = error;
	}

	expect(failure).toBeInstanceOf(CheckSourceLimitError);
	expect((failure as CheckSourceLimitError).file).toBe(reservations.at(-1)?.[0]);
});
