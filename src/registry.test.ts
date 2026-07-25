import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSession, writeSession } from "./daemon/session";
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

	it("unregisters a live root without touching its files", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = makeTempDir();
		const marker = join(root, "keep-me.txt");
		writeFileSync(marker, "project-owned");
		registerProject(spoolDir, root);

		const result = unregisterProject(spoolDir, root);

		expect(result).toEqual({ root: realpathSync(root), removed: true });
		expect(readRegistry(spoolDir).projects).toEqual([]);
		expect(readFileSync(marker, "utf8")).toBe("project-owned");
	});

	it("unregisters the project and its open tab in one operation", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const kept = realpathSync(makeTempDir());
		const removed = realpathSync(makeTempDir());
		registerProject(spoolDir, kept);
		registerProject(spoolDir, removed);
		writeSession(spoolDir, { open: [kept, removed] });

		expect(unregisterProject(spoolDir, removed)).toEqual({ root: removed, removed: true });

		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([kept]);
		expect(readSession(spoolDir)).toEqual({ open: [kept] });
	});

	it("unregisters a canonical absolute root after it vanishes", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = makeTempDir();
		registerProject(spoolDir, root);
		const registeredRoot = realpathSync(root);
		rmSync(root, { recursive: true });

		const result = unregisterProject(spoolDir, registeredRoot);

		expect(result).toEqual({ root: registeredRoot, removed: true });
		expect(readRegistry(spoolDir).projects).toEqual([]);
	});

	it("reports an unknown root without changing the registry", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const known = makeTempDir();
		const unknown = makeTempDir();
		registerProject(spoolDir, known);
		const before = readFileSync(join(spoolDir, "registry.json"), "utf8");

		const result = unregisterProject(spoolDir, unknown);

		expect(result).toEqual({ root: realpathSync(unknown), removed: false });
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([realpathSync(known)]);
		expect(readFileSync(join(spoolDir, "registry.json"), "utf8")).toBe(before);
	});

	it("matches the exact root rather than walking up", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = makeTempDir();
		const nested = join(root, "src");
		mkdirSync(nested);
		registerProject(spoolDir, root);

		const result = unregisterProject(spoolDir, nested);

		expect(result).toEqual({ root: realpathSync(nested), removed: false });
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([realpathSync(root)]);
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
