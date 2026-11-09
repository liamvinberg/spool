import { describe, expect, it } from "vitest";
import { firstRunDue, firstRunServing } from "./first-run";

describe("the first run", () => {
	it("opens by itself once, on a machine with no project, until it is done", () => {
		expect(firstRunDue({ serving: true, done: false, projects: 0 })).toBe(true);
		// finished or skipped: only Help opens it again
		expect(firstRunDue({ serving: true, done: true, projects: 0 })).toBe(false);
		// somebody who used spool before it existed is not welcomed on an update
		expect(firstRunDue({ serving: true, done: false, projects: 2 })).toBe(false);
		expect(firstRunDue({ serving: false, done: false, projects: 0 })).toBe(false);
	});

	it("is on in a packaged build, and in a checkout only when asked for", () => {
		expect(firstRunServing({}, false)).toBe(true);
		expect(firstRunServing({}, true)).toBe(false);
		expect(firstRunServing({ SPOOL_FIRST_RUN: "1" }, true)).toBe(true);
	});
});
