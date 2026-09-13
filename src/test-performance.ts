import { expect } from "vitest";

/** Wall-clock budgets are measured alone with test:performance, not beside the correctness suite. */
export function expectTiming(name: string, milliseconds: number, budget: number): void {
	if (process.env.SPOOL_TEST_PERFORMANCE !== "1") return;
	console.log(`${name}: ${milliseconds.toFixed(2)}ms (budget <${budget}ms)`);
	expect(milliseconds, name).toBeLessThan(budget);
}
