import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { firstRunDue, firstRunServing, settleFirstRun } from "./first-run";
import { createSettingsStore } from "./settings";

describe("the first run", () => {
	it("opens by itself until it is done", () => {
		expect(firstRunDue({ serving: true, done: false })).toBe(true);
		// finished or skipped: only Help opens it again
		expect(firstRunDue({ serving: true, done: true })).toBe(false);
		expect(firstRunDue({ serving: false, done: false })).toBe(false);
	});

	it("is on in a packaged build, and in a checkout only when asked for", () => {
		expect(firstRunServing({}, false)).toBe(true);
		expect(firstRunServing({}, true)).toBe(false);
		expect(firstRunServing({ SPOOL_FIRST_RUN: "1" }, true)).toBe(true);
	});

	it("is decided once per machine: never for somebody who used spool before it, whatever they do next", () => {
		const done = (spoolDir: string) =>
			createSettingsStore(spoolDir)
				.read()
				.entries.find((entry) => entry.key === "onboarding.done")?.value;

		// a daemon that only started is a new machine, and stays one
		const fresh = makeTempDir();
		writeFileSync(join(fresh, "daemon.json"), "{}");
		settleFirstRun(fresh, createSettingsStore(fresh));
		expect(done(fresh)).toBe(false);
		writeFileSync(join(fresh, "registry.json"), JSON.stringify({ version: 1, projects: [] }));
		settleFirstRun(fresh, createSettingsStore(fresh));
		expect(done(fresh)).toBe(false);

		// used before this version, even with every project since forgotten: exempt, and it stays so
		for (const used of ["registry.json", "session.json", "cloud"]) {
			const before = makeTempDir();
			if (used === "cloud") mkdirSync(join(before, used));
			else writeFileSync(join(before, used), "{}");
			settleFirstRun(before, createSettingsStore(before));
			expect(done(before)).toBe(true);
		}
	});
});
