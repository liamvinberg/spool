import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keychainVault } from "../cloud-auth";
import { fakeKeychain, makeTempDir } from "../test-helpers";
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

	it("knows somebody signed in to Spool Cloud on a Mac by the Keychain, without asking it for the session", async () => {
		const { calls } = fakeKeychain();
		const done = (spoolDir: string) =>
			createSettingsStore(spoolDir)
				.read()
				.entries.find((entry) => entry.key === "onboarding.done")?.value;
		const fresh = makeTempDir();
		settleFirstRun(fresh, createSettingsStore(fresh), "darwin");
		expect(done(fresh)).toBe(false);

		// signed in before this version: the session is in the Keychain, and nothing in the state folder says so
		const signedIn = makeTempDir();
		await keychainVault(signedIn).write("s".repeat(43));
		writeFileSync(calls, "");
		settleFirstRun(signedIn, createSettingsStore(signedIn), "darwin");
		expect(done(signedIn)).toBe(true);
		const asked = readFileSync(calls, "utf8").trim().split("\n");
		expect(asked.length).toBeGreaterThan(0);
		// by name alone: a read of the secret is what makes a Mac ask the person
		for (const line of asked) expect(line).toMatch(/^find-generic-password -a \S+ -s \S+$/);
	});
});
