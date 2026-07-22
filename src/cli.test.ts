import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { serveDaemon } from "./daemon/server";
import { makeTempDir, markProject } from "./test-helpers";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");
const cliPath = join(repoRoot, "src", "cli.ts");

function spool(args: string[], home: string, cwd?: string, env: Record<string, string> = {}) {
	return spawnSync(tsxBin, [cliPath, ...args], {
		cwd: cwd ?? repoRoot,
		encoding: "utf8",
		// SPOOL_DIR emptied so a dev shell's dogfood split cannot leak past HOME
		env: { ...process.env, HOME: home, SPOOL_DIR: "", ...env },
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

	it("status reports a stopped daemon with a nonzero exit", () => {
		const result = spool(["status"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("not running");
	});

	it("stop is goal-state: stopping a stopped daemon succeeds", () => {
		const result = spool(["stop"], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("was not running");
	});

	it("foreground serve stands down when a spool daemon already holds the port", { timeout: 15_000 }, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		// state gone but the port still held: the stand-down must repair it
		rmSync(join(spoolDir, "daemon.json"));

		// spawn, not spawnSync — the port holder lives in this process and must
		// keep answering health while the child decides to stand down
		const result = await new Promise<{ status: number | null; stdout: string }>((done, fail) => {
			const child = spawn(tsxBin, [cliPath, "serve", "--foreground"], {
				cwd: repoRoot,
				env: { ...process.env, HOME: home, SPOOL_DIR: "", SPOOL_PORT: String(daemon.port) },
			});
			let stdout = "";
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.on("error", fail);
			child.on("close", (status) => done({ status, stdout }));
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("standing down");
		expect(readDaemonState(spoolDir)?.pid).toBe(process.pid);
	});

	it("foreground serve still fails loud when a stranger holds the port", async () => {
		const stranger = createServer();
		await new Promise<void>((ready) => stranger.listen(0, "127.0.0.1", ready));
		onTestFinished(() => new Promise<void>((done) => stranger.close(() => done())));
		const address = stranger.address();
		if (address === null || typeof address === "string") throw new Error("no port");

		const result = spool(["serve", "--foreground"], makeTempDir(), undefined, {
			SPOOL_PORT: String(address.port),
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("already in use");
	});

	it("autostart rejects anything but on and off", () => {
		const result = spool(["autostart", "sideways"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('"on" or "off"');
	});

	it("autostart refuses a dogfood-split environment", () => {
		const result = spool(["autostart"], makeTempDir(), undefined, { SPOOL_DIR: makeTempDir() });

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unset SPOOL_DIR");
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
