import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSession } from "./daemon/session";
import { SpoolError } from "./errors";
import { openProject } from "./open";
import { readRegistry } from "./registry";
import { makeTempDir, markProject } from "./test-helpers";

describe("openProject", () => {
	it("resolves the product root from a nested cwd and registers it", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const repo = makeTempDir();
		markProject(repo);
		const nested = join(repo, "src", "routes");
		mkdirSync(nested, { recursive: true });

		const { root } = openProject(nested, spoolDir);

		expect(root).toBe(realpathSync(repo));
		expect(readRegistry(spoolDir).projects.map((p) => p.root)).toEqual([root]);
		expect(readSession(spoolDir)).toEqual({ open: [root] });
	});

	it("registers monorepo packages as separate projects", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const repo = makeTempDir();
		markProject(repo);
		const pkg = join(repo, "packages", "app");
		markProject(pkg);
		mkdirSync(join(pkg, "src"), { recursive: true });

		openProject(join(pkg, "src"), spoolDir);
		openProject(repo, spoolDir);

		expect(readRegistry(spoolDir).projects.map((p) => p.root)).toEqual([realpathSync(pkg), realpathSync(repo)]);
	});

	it("opening twice keeps a single registry entry", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const repo = makeTempDir();
		markProject(repo);

		openProject(repo, spoolDir);
		openProject(repo, spoolDir);

		expect(readRegistry(spoolDir).projects).toHaveLength(1);
	});

	it("fails with a pointer to spool init when nothing is found", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const dir = makeTempDir();

		expect(() => openProject(dir, spoolDir)).toThrow(SpoolError);
		expect(() => openProject(dir, spoolDir)).toThrow(/spool init/);
	});
});
