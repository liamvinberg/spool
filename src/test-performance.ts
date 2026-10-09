import { expect } from "vitest";

/** Whether this run is test:performance, measuring budgets alone rather than checking correctness beside the suite. */
export const measuringPerformance = process.env.SPOOL_TEST_PERFORMANCE === "1";

/** Wall-clock budgets are measured alone with test:performance, not beside the correctness suite. */
export function expectTiming(name: string, milliseconds: number, budget: number): void {
	if (!measuringPerformance) return;
	console.log(`${name}: ${milliseconds.toFixed(2)}ms (budget <${budget}ms)`);
	expect(milliseconds, name).toBeLessThan(budget);
}
