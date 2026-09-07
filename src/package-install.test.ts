import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
			"LICENSE.md",
			"THIRD_PARTY_NOTICES.md",
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
		const hostState = makeTempDir();
		const host = join(dirname(anchor), "dist", "bundled-host.js");
		expect(existsSync(host)).toBe(true);
		const bundledProbe = `
import { fork } from "node:child_process";
const child = fork(${JSON.stringify(host)}, [], {
	env: { HOME: ${JSON.stringify(hostState)}, SPOOL_BUNDLED_STATE: ${JSON.stringify(hostState)}, PI_OFFLINE: "1" },
	execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"]
});
const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
child.on("message", (message) => {
	process.stdout.write(JSON.stringify(message.value));
	child.kill();
});
child.on("exit", () => clearTimeout(timeout));
child.send({ id: "probe", request: { kind: "account" } });
`;
		expect(run(process.execPath, ["--input-type=module", "--eval", bundledProbe], consumer)).toBe(
			'{"signedIn":false,"account":null,"connections":[]}',
		);

		const clipboardProject = makeTempDir();
		markProject(clipboardProject);
		writeFrame(
			clipboardProject,
			"home",
			'import { ui } from "spool";\nconst copied: Promise<void> = ui.copy("packed declaration");\nvoid copied;\n',
		);
		const checkerExit = join(makeTempDir(), "checker-exit.json");
		const checkerProbe = join(makeTempDir(), "checker-probe.mjs");
		writeFileSync(
			checkerProbe,
			`
import childProcess from "node:child_process";
import { writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const spawn = childProcess.spawn;
childProcess.spawn = (...args) => {
	const child = spawn(...args);
	if (!Array.isArray(args[1]) || !args[1].includes("--api")) return child;
	const signals = [];
	const kill = child.kill.bind(child);
	child.kill = (signal) => { signals.push(signal ?? "SIGTERM"); return kill(signal); };
	// Keep the probe alive to observe the real compiler's exit, even if its API unrefs it.
	const timeout = setTimeout(() => child.kill("SIGKILL"), 15000);
	child.once("exit", (code, signal) => {
		clearTimeout(timeout);
		writeFileSync(${JSON.stringify(checkerExit)}, JSON.stringify({ signals, code, signal }));
	});
	return child;
};
syncBuiltinESMExports();
`,
		);
		const checkerEnv = {
			...process.env,
			SPOOL_DIR: "",
			NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${JSON.stringify(checkerProbe)}`,
		};
		const clipboardCheck = spawnSync(spoolBin, ["check", clipboardProject], {
			encoding: "utf8",
			env: checkerEnv,
		});
		expect(JSON.parse(readFileSync(checkerExit, "utf8"))).toEqual({ signals: [], code: 0, signal: null });
		expect(clipboardCheck.status).toBe(0);
		expect(clipboardCheck.stdout).toBe("");
		expect(clipboardCheck.stderr).toBe("");

		const project = makeTempDir();
		markProject(project);
		writeDesignFile(project, "shared/entry.cts", 'const dep = require("./dep");\nvoid dep;\n');
		writeDesignFile(project, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(project, "home", 'import "../../shared/entry.cjs";\n');
		unlinkSync(checkerExit);
		const check = spawnSync(spoolBin, ["check", project], {
			encoding: "utf8",
			env: checkerEnv,
		});
		expect(JSON.parse(readFileSync(checkerExit, "utf8"))).toEqual({ signals: [], code: 0, signal: null });
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
