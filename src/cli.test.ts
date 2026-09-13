import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { cliPath, repoRoot, spool, tsxBin } from "./cli-test-helpers";
import { readDaemonState } from "./daemon/lifecycle";
import { serveDaemon } from "./daemon/server";
import { makeTempDir } from "./test-helpers";

// Each case runs the real CLI in an isolated home. Separate files let CI share the process startup work.
describe("spool cli daemon", { timeout: 30_000 }, () => {
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

	it("foreground serve stands down when the recorded spool daemon already holds the port", {
		timeout: 15_000,
	}, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
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

	it("foreground serve refuses an occupied daemon whose credential state is missing", {
		timeout: 15_000,
	}, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		rmSync(join(spoolDir, "daemon.json"));

		const result = await new Promise<{ status: number | null; stderr: string }>((done, fail) => {
			const child = spawn(tsxBin, [cliPath, "serve", "--foreground"], {
				cwd: repoRoot,
				env: { ...process.env, HOME: home, SPOOL_DIR: "", SPOOL_PORT: String(daemon.port) },
			});
			let stderr = "";
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			child.on("error", fail);
			child.on("close", (status) => done({ status, stderr }));
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("control credential is unavailable");
		expect(readDaemonState(spoolDir)).toBeUndefined();
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

	it("upgrade refuses the checkout, pointing at git (#30)", () => {
		const result = spool(["upgrade"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("checkout");
		expect(result.stderr).toContain("git");
	});

	it("status keeps a cached release to itself when this install cannot take it (#30)", () => {
		const home = makeTempDir();
		mkdirSync(join(home, ".spool"), { recursive: true });
		writeFileSync(
			join(home, ".spool", "update.json"),
			JSON.stringify({ latest: "99.0.0", checkedAt: new Date().toISOString() }),
		);

		// the cli under test is this checkout, whose only upgrade is git: no
		// checkout daemon writes that cache any more, so one found there is stale
		// and "run `spool upgrade`" is an instruction that refuses itself
		const result = spool(["status"], home);

		expect(result.status).toBe(1); // daemon still not running
		expect(result.stdout).not.toContain("99.0.0");
		expect(result.stdout).not.toContain("spool upgrade");
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

	describe("macOS only", () => {
		it.runIf(process.platform === "darwin")("autostart refuses a dogfood-split environment", () => {
			const result = spool(["autostart"], makeTempDir(), undefined, { SPOOL_DIR: makeTempDir() });

			expect(result.status).toBe(1);
			expect(result.stderr).toContain("unset SPOOL_DIR");
		});
	});
});
