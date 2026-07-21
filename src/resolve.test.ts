import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SpoolError } from "./errors";
import { resolveProjectRoot } from "./resolve";
import { makeTempDir, markProject } from "./test-helpers";

describe("resolveProjectRoot", () => {
	it("resolves a project root from the root itself", () => {
		const root = makeTempDir();
		markProject(root);

		expect(resolveProjectRoot(root)).toBe(realpathSync(root));
	});

	it("resolves the project root from a nested directory by walking up", () => {
		const root = makeTempDir();
		markProject(root);
		const nested = join(root, "src", "features", "checkout");
		mkdirSync(nested, { recursive: true });

		expect(resolveProjectRoot(nested)).toBe(realpathSync(root));
	});

	it("resolves the nearest marker, so monorepo packages are separate projects", () => {
		const repo = makeTempDir();
		markProject(repo);
		const pkg = join(repo, "packages", "app");
		markProject(pkg);
		const deep = join(pkg, "src", "routes");
		mkdirSync(deep, { recursive: true });

		expect(resolveProjectRoot(deep)).toBe(realpathSync(pkg));
	});

	it("returns undefined when no marker exists up to the filesystem root", () => {
		const dir = makeTempDir();

		expect(resolveProjectRoot(dir)).toBeUndefined();
	});

	it("throws a clear error when the start directory does not exist", () => {
		const dir = makeTempDir();

		expect(() => resolveProjectRoot(join(dir, "missing"))).toThrow(SpoolError);
		expect(() => resolveProjectRoot(join(dir, "missing"))).toThrow(/no such directory/);
	});
});
