import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { serveDaemon } from "./daemon/server";
import { makeProject, makeTempDir, markProject, writeFrame } from "./test-helpers";

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

function spoolAsync(args: string[], home: string, cwd: string) {
	return new Promise<{ status: number | null; stdout: string; stderr: string }>((done, fail) => {
		const child = spawn(tsxBin, [cliPath, ...args], {
			cwd,
			env: { ...process.env, HOME: home, SPOOL_DIR: "" },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", fail);
		child.on("close", (status) => done({ status, stdout, stderr }));
	});
}

describe("spool cli", () => {
	it.each([
		[["shot", "cart", "--viewport", "390-by-844"], "--viewport must be <width>x<height> with positive integers"],
		[["shot", "cart", "--viewport", "0x844"], "--viewport must be <width>x<height> with positive integers"],
		[["shot", "cart", "--at", "soon"], "--at must be whole milliseconds"],
		[["shot", "cart", "--scenario", "review/error"], "--scenario must be a scenario name"],
		[["logs", "cart", "--scenario", ".private"], "--scenario must be a scenario name"],
	] as const)("rejects an invalid verification option before resolving the project", (args, message) => {
		const result = spool([...args], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(message);
	});

	it("lists every verification control on its owning command", () => {
		const shot = spool(["shot", "--help"], makeTempDir());
		const logs = spool(["logs", "--help"], makeTempDir());
		const url = spool(["url", "--help"], makeTempDir());

		expect(shot.stdout).toContain("--viewport <width>x<height>");
		expect(shot.stdout).toContain("--at <milliseconds>");
		expect(shot.stdout).toContain("--scenario <name>");
		expect(logs.stdout).toContain("--scenario <name>");
		expect(url.stdout).toContain("--raw");
	});

	it("says a replayed cache matches current compiled source", async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main>; }\n");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		const verify = await fetch(`${daemon.url}/api/p/${name}/verify/quiet`, {
			headers: { "X-Spool-Control": daemon.controlToken },
		});
		const { etag } = (await verify.json()) as { etag: string };
		const cacheDir = join(root, "design", ".spool", "verify");
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(
			join(cacheDir, "quiet.logs.json"),
			`${JSON.stringify({ etag, scenario: "default", entries: [] })}\n`,
		);

		const result = await spoolAsync(["logs", "quiet"], home, root);

		expect(result.status).toBe(0);
		expect(result.stderr).toContain("cache matches current compiled source");
	});

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

	it("autostart refuses a dogfood-split environment", () => {
		const result = spool(["autostart"], makeTempDir(), undefined, { SPOOL_DIR: makeTempDir() });

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unset SPOOL_DIR");
	});

	it("upgrade refuses the checkout, pointing at git (#30)", () => {
		const result = spool(["upgrade"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("checkout");
		expect(result.stderr).toContain("git");
	});

	it("status mentions a cached newer release without phoning home (#30)", () => {
		const home = makeTempDir();
		mkdirSync(join(home, ".spool"), { recursive: true });
		writeFileSync(
			join(home, ".spool", "update.json"),
			JSON.stringify({ latest: "99.0.0", checkedAt: new Date().toISOString() }),
		);

		const result = spool(["status"], home);

		expect(result.status).toBe(1); // daemon still not running
		expect(result.stdout).toContain("v99.0.0 available");
		expect(result.stdout).toContain("spool upgrade");
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
