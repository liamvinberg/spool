import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { SpoolError } from "../errors";
import { makeTempDir } from "../test-helpers";
import {
	ensureDaemon,
	readDaemonState,
	resolveServeConfig,
	resolveSpoolDir,
	spoolDaemonAt,
	statusDaemon,
	stopDaemon,
} from "./lifecycle";
import { serveDaemon } from "./server";

function makeSpoolDir(): string {
	return join(makeTempDir(), ".spool");
}

async function makeServer(spoolDir: string, version = "0.0.0-test") {
	const config = resolveServeConfig(spoolDir, {});
	const daemon = await serveDaemon({ spoolDir, version, host: config.host, port: 0 });
	onTestFinished(() => daemon.close());
	return daemon;
}

describe("resolveSpoolDir", () => {
	it("defaults to ~/.spool", () => {
		expect(resolveSpoolDir({})).toBe(join(homedir(), ".spool"));
	});

	it("honors SPOOL_DIR so a checkout daemon keeps its state beside the daily one", () => {
		const dir = makeTempDir();
		expect(resolveSpoolDir({ SPOOL_DIR: dir })).toBe(resolve(dir));
	});

	it("treats an empty SPOOL_DIR as unset", () => {
		expect(resolveSpoolDir({ SPOOL_DIR: "" })).toBe(join(homedir(), ".spool"));
	});
});

describe("resolveServeConfig", () => {
	it("defaults to localhost:7766 — exposure is never implicit", () => {
		expect(resolveServeConfig(makeSpoolDir(), {})).toEqual({ host: "127.0.0.1", port: 7766, updateCheck: true });
	});

	it("honors the owner's explicit host and port config", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ host: "0.0.0.0", port: 7800 }));

		expect(resolveServeConfig(spoolDir, {})).toEqual({ host: "0.0.0.0", port: 7800, updateCheck: true });
	});

	it("lets the environment override config for checkout-on-its-own-port development", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ port: 7800 }));

		const config = resolveServeConfig(spoolDir, { SPOOL_PORT: "7801", SPOOL_HOST: "::1" });

		expect(config).toEqual({ host: "::1", port: 7801, updateCheck: true });
	});

	it("honors the phone-home opt-out and rejects a non-boolean one (#30)", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ updateCheck: false }));

		expect(resolveServeConfig(spoolDir, {}).updateCheck).toBe(false);

		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ updateCheck: "never" }));
		expect(() => resolveServeConfig(spoolDir, {})).toThrow(/updateCheck/);
	});

	it("rejects malformed config loudly instead of guessing", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), "{not json");

		expect(() => resolveServeConfig(spoolDir, {})).toThrow(SpoolError);
		expect(() => resolveServeConfig(makeSpoolDir(), { SPOOL_PORT: "canvas" })).toThrow(SpoolError);

		const outOfRange = makeSpoolDir();
		mkdirSync(outOfRange, { recursive: true });
		writeFileSync(join(outOfRange, "config.json"), JSON.stringify({ port: 99999 }));
		expect(() => resolveServeConfig(outOfRange, {})).toThrow(/port number/);
	});
});

describe("serveDaemon", () => {
	it("binds, answers health over real http, and records daemon state", async () => {
		const spoolDir = makeSpoolDir();
		const daemon = await makeServer(spoolDir);

		expect(daemon.host).toBe("127.0.0.1");
		const health = (await (await fetch(`${daemon.url}/api/health`)).json()) as { name: string; pid: number };
		expect(health.name).toBe("spool");
		expect(health.pid).toBe(process.pid);

		const state = readDaemonState(spoolDir);
		expect(state).toEqual({
			pid: process.pid,
			host: "127.0.0.1",
			port: daemon.port,
			version: "0.0.0-test",
			startedAt: expect.any(String),
		});
	});

	it("clears its state on close", async () => {
		const spoolDir = makeSpoolDir();
		const daemon = await makeServer(spoolDir);

		await daemon.close();

		expect(readDaemonState(spoolDir)).toBeUndefined();
	});
});

describe("spoolDaemonAt", () => {
	it("returns the answering daemon's health, and nothing for a dead port", async () => {
		const daemon = await makeServer(makeSpoolDir());

		expect(await spoolDaemonAt("127.0.0.1", daemon.port)).toEqual({
			name: "spool",
			version: "0.0.0-test",
			pid: process.pid,
			startedAt: expect.any(String),
		});
		expect(await spoolDaemonAt("127.0.0.1", 1)).toBeUndefined();
	});
});

describe("statusDaemon", () => {
	it("reports not running when no daemon state exists", async () => {
		expect(await statusDaemon(makeSpoolDir())).toEqual({ running: false });
	});

	it("cleans stale state left by a dead daemon", async () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		const stale = {
			pid: 99999999,
			host: "127.0.0.1",
			port: 65534,
			version: "0.0.0",
			startedAt: "2026-01-01T00:00:00Z",
		};
		writeFileSync(join(spoolDir, "daemon.json"), JSON.stringify(stale));

		expect(await statusDaemon(spoolDir)).toEqual({ running: false });
		expect(existsSync(join(spoolDir, "daemon.json"))).toBe(false);
	});

	it("reports a live daemon with url, pid and version", async () => {
		const spoolDir = makeSpoolDir();
		const daemon = await makeServer(spoolDir);

		expect(await statusDaemon(spoolDir)).toEqual({
			running: true,
			url: daemon.url,
			pid: process.pid,
			version: "0.0.0-test",
		});
	});
});

describe("ensureDaemon", () => {
	it("reuses a healthy daemon instead of spawning", async () => {
		const spoolDir = makeSpoolDir();
		const daemon = await makeServer(spoolDir);
		const neverRun = ["/nonexistent-spool-binary"];

		const result = await ensureDaemon(spoolDir, { command: neverRun });

		expect(result).toEqual({ url: daemon.url, pid: process.pid, started: false });
	});
});

describe("stopDaemon", () => {
	it("reports not running and clears stale state", async () => {
		const spoolDir = makeSpoolDir();
		expect(await stopDaemon(spoolDir)).toEqual({ stopped: false });

		mkdirSync(spoolDir, { recursive: true });
		const stale = {
			pid: 99999999,
			host: "127.0.0.1",
			port: 65534,
			version: "0.0.0",
			startedAt: "2026-01-01T00:00:00Z",
		};
		writeFileSync(join(spoolDir, "daemon.json"), JSON.stringify(stale));
		expect(await stopDaemon(spoolDir)).toEqual({ stopped: false });
		expect(existsSync(join(spoolDir, "daemon.json"))).toBe(false);
	});
});

describe("daemon lifecycle end to end", () => {
	it("first verb auto-starts, the next reuses, stop tears down", { timeout: 40_000 }, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
		const command = [
			join(repoRoot, "node_modules", ".bin", "tsx"),
			join(repoRoot, "src", "cli.ts"),
			"serve",
			"--foreground",
		];
		// SPOOL_PORT=0 → the child binds an ephemeral port and records it in
		// daemon.json; SPOOL_DIR emptied so a dev shell's split cannot leak
		const env = { HOME: home, SPOOL_PORT: "0", SPOOL_DIR: "" };
		onTestFinished(async () => {
			await stopDaemon(spoolDir).catch(() => {});
		});

		const first = await ensureDaemon(spoolDir, { command, env, timeoutMs: 30_000 });
		expect(first.started).toBe(true);
		expect(first.pid).not.toBe(process.pid);

		const second = await ensureDaemon(spoolDir, { command: ["/nonexistent-spool"], env });
		expect(second).toEqual({ url: first.url, pid: first.pid, started: false });

		const status = await statusDaemon(spoolDir);
		expect(status.running).toBe(true);

		const stopped = await stopDaemon(spoolDir);
		expect(stopped).toEqual({ stopped: true, pid: first.pid });
		expect(await statusDaemon(spoolDir)).toEqual({ running: false });
	});
});

describe("daemon state file", () => {
	it("survives round-trip and treats corrupt state as absent", () => {
		const spoolDir = makeSpoolDir();
		expect(readDaemonState(spoolDir)).toBeUndefined();

		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "daemon.json"), "{corrupt");
		expect(readDaemonState(spoolDir)).toBeUndefined();
		expect(readFileSync(join(spoolDir, "daemon.json"), "utf8")).toBe("{corrupt");
	});
});
