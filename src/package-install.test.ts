import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function run(command: string, args: string[], cwd: string): string {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	expect(result.status, `${command} ${args.join(" ")}\n${result.stderr}`).toBe(0);
	return result.stdout.trim();
}

describe("packed install", () => {
	it("runs the installed checker and prints its own Playwright anchor from a global-style prefix", {
		timeout: 180_000,
	}, () => {
		const packageRoot = makeTempDir();
		for (const file of [
			"package.json",
			"tsup.config.ts",
			"vite.config.ts",
			"tsconfig.json",
			"tsconfig.runtime.json",
			"tsconfig.ui.json",
		]) {
			cpSync(join(repoRoot, file), join(packageRoot, file));
		}
		cpSync(join(repoRoot, "src"), join(packageRoot, "src"), { recursive: true });
		symlinkSync(join(repoRoot, "node_modules"), join(packageRoot, "node_modules"), "dir");
		const tarball = join(makeTempDir(), "spool-page.tgz");
		run("pnpm", ["pack", "--out", tarball], packageRoot);

		const prefix = makeTempDir();
		writeFileSync(join(prefix, "package.json"), '{ "private": true }\n');
		run("pnpm", ["add", "--prefer-offline", "--ignore-scripts", tarball], prefix);
		const prefixManifest = JSON.parse(readFileSync(join(prefix, "package.json"), "utf8")) as {
			dependencies?: Record<string, string>;
		};
		expect(Object.keys(prefixManifest.dependencies ?? {})).toEqual(["spool.page"]);

		const consumer = makeTempDir();
		const spoolBin = join(prefix, "node_modules", ".bin", "spool");
		const verbs = run(spoolBin, ["skill", "verbs"], consumer);
		const encodedAnchor = verbs.match(/createRequire\(("(?:\\.|[^"])+")\)/)?.[1];
		expect(encodedAnchor, "installed skill package anchor").toBeDefined();
		const anchor = JSON.parse(encodedAnchor ?? '""') as string;
		expect(anchor).toContain("spool.page");
		expect(JSON.parse(readFileSync(anchor, "utf8"))).toMatchObject({ name: "spool.page" });

		const clipboardProject = makeTempDir();
		markProject(clipboardProject);
		writeFrame(
			clipboardProject,
			"home",
			'import { ui } from "spool";\nconst copied: Promise<void> = ui.copy("packed declaration");\nvoid copied;\n',
		);
		const clipboardCheck = spawnSync(spoolBin, ["check", clipboardProject], {
			encoding: "utf8",
			env: { ...process.env, SPOOL_DIR: "" },
		});
		expect(clipboardCheck.status).toBe(0);
		expect(clipboardCheck.stdout).toBe("");
		expect(clipboardCheck.stderr).toBe("");

		const project = makeTempDir();
		markProject(project);
		writeDesignFile(project, "shared/entry.cts", 'const dep = require("./dep");\nvoid dep;\n');
		writeDesignFile(project, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(project, "home", 'import "../../shared/entry.cjs";\n');
		const check = spawnSync(spoolBin, ["check", project], {
			encoding: "utf8",
			env: { ...process.env, SPOOL_DIR: "" },
		});
		expect(check.status).toBe(1);
		expect(check.stdout).toBe("");
		expect(check.stderr).toBe(
			"design/shared/dep.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.\n",
		);
		expect(check.stderr).not.toContain("TS2591");

		expect(existsSync(join(consumer, "node_modules", "spool.page"))).toBe(false);
		expect(existsSync(join(consumer, "node_modules", "playwright-core"))).toBe(false);

		const script = `
import { createRequire } from "node:module";
const requireFromSpool = createRequire(${JSON.stringify(anchor)});
const { chromium } = requireFromSpool("playwright-core");
process.stdout.write(typeof chromium.launch);
`;
		expect(run(process.execPath, ["--input-type=module", "--eval", script], consumer)).toBe("function");
	});
});
