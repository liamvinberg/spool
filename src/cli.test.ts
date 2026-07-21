import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeTempDir, markProject } from "./test-helpers";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");
const cliPath = join(repoRoot, "src", "cli.ts");

function spool(args: string[], home: string, cwd?: string) {
	return spawnSync(tsxBin, [cliPath, ...args], {
		cwd: cwd ?? repoRoot,
		encoding: "utf8",
		env: { ...process.env, HOME: home },
	});
}

describe("spool cli", () => {
	it("init scaffolds, registers and prints the root-config pointer", () => {
		const home = makeTempDir();
		const target = makeTempDir();

		const result = spool(["init", target], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`initialized spool project at ${realpathSync(target)}`);
		expect(result.stdout).toContain("design/ is a spool canvas");
		expect(existsSync(join(target, "design", "canvas.json"))).toBe(true);
		const registry = JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8"));
		expect(registry.projects[0].root).toBe(realpathSync(target));
	});

	it("open resolves by walk-up from the cwd", () => {
		const home = makeTempDir();
		const repo = makeTempDir();
		markProject(repo);
		const nested = join(repo, "src");
		mkdirSync(nested);

		const result = spool(["open"], home, nested);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(realpathSync(repo));
	});

	it("fails cleanly on an unknown command", () => {
		const result = spool(["frobnicate"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unknown command");
	});

	it("prints a version", () => {
		const result = spool(["--version"], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
