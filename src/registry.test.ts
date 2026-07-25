import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SpoolError } from "./errors";
import { readRegistry, registerProject, unregisterProject } from "./registry";
import { makeTempDir } from "./test-helpers";

describe("registry", () => {
	it("reads an empty registry when none exists yet", () => {
		const spoolDir = join(makeTempDir(), ".spool");

		expect(readRegistry(spoolDir)).toEqual({ version: 1, projects: [] });
	});

	it("registers a project and writes registry.json", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = makeTempDir();

		registerProject(spoolDir, root);

		const file = join(spoolDir, "registry.json");
		expect(existsSync(file)).toBe(true);
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		expect(parsed.version).toBe(1);
		expect(parsed.projects).toHaveLength(1);
		expect(parsed.projects[0].root).toBe(realpathSync(root));
		expect(Number.isNaN(Date.parse(parsed.projects[0].openedAt))).toBe(false);
	});

	it("re-registering the same root updates openedAt without duplicating", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = makeTempDir();

		registerProject(spoolDir, root);
		const first = readRegistry(spoolDir).projects[0];
		registerProject(spoolDir, root);
		const after = readRegistry(spoolDir);

		expect(after.projects).toHaveLength(1);
		expect((after.projects[0]?.openedAt ?? "") >= (first?.openedAt ?? "")).toBe(true);
	});

	it("keeps multiple projects in registration order", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const a = makeTempDir();
		const b = makeTempDir();

		registerProject(spoolDir, a);
		registerProject(spoolDir, b);

		expect(readRegistry(spoolDir).projects.map((p) => p.root)).toEqual([realpathSync(a), realpathSync(b)]);
	});

	it("unregisters a project, leaving the others and the folder alone", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const a = makeTempDir();
		const b = makeTempDir();
		registerProject(spoolDir, a);
		registerProject(spoolDir, b);

		expect(unregisterProject(spoolDir, realpathSync(a))).toBe(true);

		expect(readRegistry(spoolDir).projects.map((p) => p.root)).toEqual([realpathSync(b)]);
		expect(existsSync(a)).toBe(true);
	});

	it("reports an unregister of a root it never knew, writing nothing", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = makeTempDir();
		registerProject(spoolDir, root);
		const before = readFileSync(join(spoolDir, "registry.json"), "utf8");

		expect(unregisterProject(spoolDir, "/nowhere/at/all")).toBe(false);

		expect(readFileSync(join(spoolDir, "registry.json"), "utf8")).toBe(before);
	});

	it("fails loudly on a corrupt registry file instead of wiping it", () => {
		const spoolDir = makeTempDir();
		const file = join(spoolDir, "registry.json");
		writeFileSync(file, "{not json");

		expect(() => readRegistry(spoolDir)).toThrow(SpoolError);
		expect(() => readRegistry(spoolDir)).toThrow(file);
	});

	it("rejects valid JSON that is not a registry", () => {
		const spoolDir = makeTempDir();
		writeFileSync(join(spoolDir, "registry.json"), '{"foo": 1}');

		expect(() => readRegistry(spoolDir)).toThrow(SpoolError);
		expect(() => readRegistry(spoolDir)).toThrow(/corrupt registry/);
	});

	it("surfaces unreadable registries instead of treating them as empty", () => {
		const spoolDir = makeTempDir();
		mkdirSync(join(spoolDir, "registry.json"));

		expect(() => readRegistry(spoolDir)).toThrow(SpoolError);
		expect(() => readRegistry(spoolDir)).toThrow(/cannot read registry/);
	});
});
