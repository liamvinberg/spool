import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer, type Socket } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { SpoolError } from "../errors";
import { makeTempDir } from "../test-helpers";
import {
	ensureDaemon,
	readDaemonState,
	renderOrigin,
	resolveServeConfig,
	resolveSpoolDir,
	spoolDaemonAt,
	statusDaemon,
	stopDaemon,
	writeDaemonState,
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
		expect(resolveServeConfig(makeSpoolDir(), {})).toEqual({
			host: "127.0.0.1",
			port: 7766,
			updateCheck: true,
			experiments: [],
			notices: [],
		});
	});

	it.each(["127.0.0.1", "localhost", "::1"])("honors the supported loopback host %s", (host) => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ host, port: 7800 }));

		expect(resolveServeConfig(spoolDir, {})).toEqual({
			host,
			port: 7800,
			updateCheck: true,
			experiments: [],
			notices: [],
		});
	});

	it("lets the environment override config for checkout-on-its-own-port development", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ port: 7800 }));

		const config = resolveServeConfig(spoolDir, { SPOOL_PORT: "7801", SPOOL_HOST: "::1" });

		expect(config).toEqual({ host: "::1", port: 7801, updateCheck: true, experiments: [], notices: [] });
	});

	it("honors the phone-home opt-out and rejects a non-boolean one (#30)", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ updateCheck: false }));

		expect(resolveServeConfig(spoolDir, {}).updateCheck).toBe(false);

		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ updateCheck: "never" }));
		expect(() => resolveServeConfig(spoolDir, {})).toThrow(/updateCheck/);
	});

	it("reads the experiments the machine switched on, and judges none of them (#238)", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });

		// no file at all, and a file that never mentions them: nothing is on
		expect(resolveServeConfig(spoolDir, {}).experiments).toEqual([]);
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ port: 7800 }));
		expect(resolveServeConfig(spoolDir, {}).experiments).toEqual([]);

		// a name this version has never heard of is carried across rather than
		// refused: the vocabulary belongs to the surface that reads it
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experiments: ["agent-panel", "not-a-thing"] }));
		expect(resolveServeConfig(spoolDir, {}).experiments).toEqual(["agent-panel", "not-a-thing"]);

		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experiments: "agent-panel" }));
		expect(() => resolveServeConfig(spoolDir, {})).toThrow(/experiments/);
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experiments: ["agent-panel", 7] }));
		expect(() => resolveServeConfig(spoolDir, {})).toThrow(/experiments/);
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

	it("refuses an off-loopback SPOOL_HOST, because that is someone asking right now", () => {
		expect(() => resolveServeConfig(makeSpoolDir(), { SPOOL_HOST: "192.168.1.10" })).toThrow(/loopback/);
		expect(() => resolveServeConfig(makeSpoolDir(), { SPOOL_HOST: "127.2.3.4" })).toThrow(/supported loopback/);
		expect(() => resolveServeConfig(makeSpoolDir(), { SPOOL_HOST: "0.0.0.0" })).toThrow(/loopback/);
	});

	/**
	 * A host that was legal before `76d98eb` must not brick the install. The config
	 * is read before anything runs, so throwing here took every verb down with it
	 * and left no way out but hand-editing a file the error did not name.
	 */
	// 100.64.0.1 is the shape that caused this: a tailnet address, reachable and
	// dialable, which is exactly why the daemon must not bind it
	it.each(["0.0.0.0", "127.2.3.4", "100.64.0.1"])("ignores the stale config host %s and says so", (host) => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ host, port: 7800 }));

		const config = resolveServeConfig(spoolDir, {});

		expect(config.host).toBe("127.0.0.1");
		expect(config.port).toBe(7800);
		expect(config.notices).toHaveLength(1);
		expect(config.notices[0]).toContain(host);
		expect(config.notices[0]).toContain(join(spoolDir, "config.json"));
	});

	it("leaves the config file alone rather than healing it behind the owner's back", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		const file = join(spoolDir, "config.json");
		const before = JSON.stringify({ host: "0.0.0.0", port: 7800 });
		writeFileSync(file, before);

		resolveServeConfig(spoolDir, {});

		expect(readFileSync(file, "utf8")).toBe(before);
	});

	it("still refuses an off-loopback SPOOL_HOST over a stale config host", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ host: "0.0.0.0" }));

		expect(() => resolveServeConfig(spoolDir, { SPOOL_HOST: "10.0.0.4" })).toThrow(/loopback/);
	});
});

describe("renderOrigin", () => {
	it("moves a control URL onto the fixed render hostname without changing its port", () => {
		expect(renderOrigin("http://127.0.0.1:7766")).toBe("http://run.spool.localhost:7766");
		expect(renderOrigin("http://[::1]:8123")).toBe("http://run.spool.localhost:8123");
	});
});

describe("serveDaemon", () => {
	it.each(["0.0.0.0", "127.2.3.4"])("refuses the unsupported bind %s below config resolution", (host) => {
		expect(() =>
			serveDaemon({
				spoolDir: makeSpoolDir(),
				version: "0.0.0-test",
				host,
				port: 0,
			}),
		).toThrow(/loopback/);
	});

	it("binds, answers health over real http, and records daemon state", async () => {
		const spoolDir = makeSpoolDir();
		const daemon = await makeServer(spoolDir);

		expect(daemon.host).toBe("127.0.0.1");
		const health = (await (await fetch(`${daemon.url}/api/health`)).json()) as { name: string; pid: number };
		expect(health.name).toBe("spool");
		expect(health.pid).toBe(process.pid);
		expect((await fetch(`${renderOrigin(daemon.url)}/vendor/spool.js`)).status).toBe(200);

		const state = readDaemonState(spoolDir);
		expect(state).toEqual({
			pid: process.pid,
			host: "127.0.0.1",
			port: daemon.port,
			version: "0.0.0-test",
			startedAt: expect.any(String),
			controlToken: expect.any(String),
		});
		expect(state?.controlToken.length).toBeGreaterThanOrEqual(32);
		expect(statSync(join(spoolDir, "daemon.json")).mode & 0o777).toBe(0o600);
	});

	it.each(["127.0.0.1", "localhost", "::1"])(
		"serves both virtual hosts through the supported bind %s",
		async (host) => {
			const daemon = await serveDaemon({
				spoolDir: makeSpoolDir(),
				version: "0.0.0-test",
				host,
				port: 0,
			});
			onTestFinished(() => daemon.close());

			expect((await fetch(`${daemon.url}/api/health`)).status).toBe(200);
			expect((await fetch(`${renderOrigin(daemon.url)}/vendor/spool.js`)).status).toBe(200);
		},
	);

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
			controlToken: "stale-control-token",
		};
		writeFileSync(join(spoolDir, "daemon.json"), JSON.stringify(stale));

		expect(await statusDaemon(spoolDir)).toEqual({ running: false });
		expect(existsSync(join(spoolDir, "daemon.json"))).toBe(false);
	});

	it("never sweeps state a successor wrote while the health probe was in flight", async () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		// accepts and never answers, so the probe spends its full timeout —
		// the window an upgrade's restart lands in
		const held: Socket[] = [];
		const mute = createServer((socket) => held.push(socket));
		await new Promise<void>((ready) => mute.listen(0, "127.0.0.1", ready));
		onTestFinished(() => {
			// the aborted fetch leaves its socket open, and close() waits on it
			for (const socket of held.splice(0)) socket.destroy();
			return new Promise<void>((done) => mute.close(() => done()));
		});
		const address = mute.address();
		if (address === null || typeof address === "string") throw new Error("no port");
		writeDaemonState(spoolDir, {
			pid: 99999999,
			host: "127.0.0.1",
			port: address.port,
			version: "0.0.0",
			startedAt: "2026-01-01T00:00:00Z",
			controlToken: "doomed-control-token",
		});

		// the read is done the moment statusDaemon is called; the successor
		// records itself while the probe hangs on the mute listener
		const probing = statusDaemon(spoolDir);
		const successor = {
			pid: 4242,
			host: "127.0.0.1",
			port: 65533,
			version: "0.0.1",
			startedAt: "2026-01-02T00:00:00Z",
			controlToken: "successor-control-token",
		};
		writeDaemonState(spoolDir, successor);

		expect(await probing).toEqual({ running: false });
		expect(readDaemonState(spoolDir)).toEqual(successor);
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

		expect(result).toEqual({ url: daemon.url, pid: process.pid, started: false, controlToken: expect.any(String) });
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
			controlToken: "stale-control-token",
		};
		writeFileSync(join(spoolDir, "daemon.json"), JSON.stringify(stale));
		expect(await stopDaemon(spoolDir)).toEqual({ stopped: false });
		expect(existsSync(join(spoolDir, "daemon.json"))).toBe(false);
	});

	it("refuses to report a forwarded daemon stopped: its pid is not a process here", async () => {
		const spoolDir = makeSpoolDir();
		// what an ssh tunnel to another machine's daemon looks like from here:
		// healthy, and naming a pid that exists only on the other end
		const forwarded = createHttpServer((_request, response) => {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(
				JSON.stringify({
					name: "spool",
					version: "0.0.0-remote",
					pid: 99999999,
					startedAt: "2026-01-01T00:00:00Z",
				}),
			);
		});
		await new Promise<void>((ready) => forwarded.listen(0, "127.0.0.1", ready));
		onTestFinished(() => new Promise<void>((done) => forwarded.close(() => done())));
		const address = forwarded.address();
		if (address === null || typeof address === "string") throw new Error("no port");
		const env = { SPOOL_PORT: String(address.port), SPOOL_DIR: spoolDir };

		await expect(stopDaemon(spoolDir, { force: true, env })).rejects.toThrow(/not a process on this machine/);
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
		expect(second).toEqual({ url: first.url, pid: first.pid, started: false, controlToken: first.controlToken });

		const status = await statusDaemon(spoolDir);
		expect(status.running).toBe(true);

		const stopped = await stopDaemon(spoolDir);
		expect(stopped).toEqual({ stopped: true, pid: first.pid, adopted: false });
		expect(await statusDaemon(spoolDir)).toEqual({ running: false });
	});

	it("stop --force adopts a daemon whose credential state is gone", { timeout: 40_000 }, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
		const command = [
			join(repoRoot, "node_modules", ".bin", "tsx"),
			join(repoRoot, "src", "cli.ts"),
			"serve",
			"--foreground",
		];
		const env = { HOME: home, SPOOL_PORT: "0", SPOOL_DIR: "" };
		const daemon = await ensureDaemon(spoolDir, { command, env, timeoutMs: 30_000 });
		onTestFinished(() => {
			try {
				process.kill(daemon.pid, "SIGKILL");
			} catch {
				// already gone
			}
		});
		const port = readDaemonState(spoolDir)?.port;
		if (port === undefined) throw new Error("the daemon recorded no port");
		rmSync(join(spoolDir, "daemon.json"));
		// the address the orphan holds, as the shell that would serve it sees it
		const forceEnv = { SPOOL_PORT: String(port), SPOOL_DIR: spoolDir };

		// nothing is taken down on an address alone
		expect(await stopDaemon(spoolDir, { env: forceEnv })).toEqual({ stopped: false });
		expect(await spoolDaemonAt("127.0.0.1", port)).toBeDefined();

		expect(await stopDaemon(spoolDir, { force: true, env: forceEnv })).toEqual({
			stopped: true,
			pid: daemon.pid,
			adopted: true,
		});
		expect(await spoolDaemonAt("127.0.0.1", port)).toBeUndefined();
	});

	it("stop tears down an open app event stream", { timeout: 40_000 }, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
		const command = [
			join(repoRoot, "node_modules", ".bin", "tsx"),
			join(repoRoot, "src", "cli.ts"),
			"serve",
			"--foreground",
		];
		const env = { HOME: home, SPOOL_PORT: "0", SPOOL_DIR: "" };
		const daemon = await ensureDaemon(spoolDir, { command, env, timeoutMs: 30_000 });
		const stream = await fetch(`${daemon.url}/api/events`, {
			headers: { "X-Spool-Control": daemon.controlToken },
		});
		const reader = stream.body?.getReader();
		if (reader === undefined) throw new Error("app event stream has no body");
		onTestFinished(async () => {
			await reader.cancel().catch(() => {});
			await stopDaemon(spoolDir).catch(() => {});
		});

		const hello = await reader.read();
		expect(new TextDecoder().decode(hello.value)).toContain("event: hello");

		await expect(stopDaemon(spoolDir)).resolves.toEqual({ stopped: true, pid: daemon.pid, adopted: false });
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

	it("treats state without a control token as absent", () => {
		const spoolDir = makeSpoolDir();
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(
			join(spoolDir, "daemon.json"),
			JSON.stringify({ pid: 1, host: "127.0.0.1", port: 7766, version: "0.0.0", startedAt: "2026-01-01T00:00:00Z" }),
		);

		expect(readDaemonState(spoolDir)).toBeUndefined();
	});
});
