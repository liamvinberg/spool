import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	alive,
	behind,
	configuredAddress,
	connectHost,
	daemonUrl,
	health,
	readState,
	start,
	stateDirectory,
	status,
	stop,
	userDataDirectory,
} from "./daemon";

function temporary(): string {
	return mkdtempSync(join(tmpdir(), "spool-desktop-"));
}

test("the state directory is ~/.spool unless SPOOL_DIR says otherwise", () => {
	assert.equal(stateDirectory({}), join(homedir(), ".spool"));
	assert.equal(stateDirectory({ SPOOL_DIR: "" }), join(homedir(), ".spool"));
	assert.equal(stateDirectory({ SPOOL_DIR: "/tmp/lane" }), "/tmp/lane");
	assert.equal(stateDirectory({ SPOOL_DIR: "~/.spool-lane" }), join(homedir(), ".spool-lane"));
});

test("a lane keeps its app state, and its instance lock, inside the lane", () => {
	const daily = "/Library/Application Support/spool-desktop";
	assert.equal(userDataDirectory(daily, {}), daily);
	assert.equal(userDataDirectory(daily, { SPOOL_DIR: "" }), daily);
	assert.equal(userDataDirectory(daily, { SPOOL_DIR: "/tmp/lane" }), join("/tmp/lane", "app"));
	assert.equal(userDataDirectory(daily, { SPOOL_DIR: "~/.spool-lane" }), join(homedir(), ".spool-lane", "app"));
});

test("corrupt, absent and half-written state all read as absent", () => {
	const directory = temporary();
	try {
		assert.equal(readState(directory), undefined);
		writeFileSync(join(directory, "daemon.json"), "{ not json");
		assert.equal(readState(directory), undefined);
		// no control token means a daemon that never finished starting
		writeFileSync(
			join(directory, "daemon.json"),
			JSON.stringify({ pid: 1, host: "127.0.0.1", port: 7766, version: "0.9.1", startedAt: "now" }),
		);
		assert.equal(readState(directory), undefined);
		writeFileSync(
			join(directory, "daemon.json"),
			JSON.stringify({
				pid: 1,
				host: "127.0.0.1",
				port: 7766,
				version: "0.9.1",
				startedAt: "now",
				controlToken: "secret",
			}),
		);
		assert.deepEqual(readState(directory), {
			pid: 1,
			host: "127.0.0.1",
			port: 7766,
			version: "0.9.1",
			startedAt: "now",
			controlToken: "secret",
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("a daemon is behind the bundle only when both rank and the bundle's is higher", () => {
	assert.equal(behind("0.13.0", "0.14.0"), true);
	assert.equal(behind("0.14.0", "0.14.0"), false);
	assert.equal(behind("0.15.0", "0.14.0"), false);
	assert.equal(behind("0.9.9", "0.10.0"), true);
	// unrankable on either side is never a replacement: it could be a downgrade
	assert.equal(behind("0.13.0-dev", "0.14.0"), false);
	assert.equal(behind("0.13.0", "next"), false);
});

test("a bind-everything host is not a dialable address", () => {
	assert.equal(connectHost("0.0.0.0"), "127.0.0.1");
	assert.equal(connectHost("::"), "::1");
	assert.equal(connectHost("localhost"), "localhost");
	assert.equal(daemonUrl("0.0.0.0", 7766), "http://127.0.0.1:7766");
	assert.equal(daemonUrl("::1", 7766), "http://[::1]:7766");
});

test("health is only health when it answers as spool", async () => {
	const bodies = [
		{ name: "something-else", version: "1.0.0", pid: 2, startedAt: "now" },
		{ name: "spool", version: 1, pid: 2, startedAt: "now" },
		{ name: "spool", version: "0.9.1", pid: 2, startedAt: "now" },
	];
	let index = 0;
	const server = createServer((_request, response) => {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify(bodies[index]));
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		assert.equal(await health(url), undefined);
		index = 1;
		assert.equal(await health(url), undefined);
		index = 2;
		assert.deepEqual(await health(url), { version: "0.9.1", pid: 2, startedAt: "now" });
	} finally {
		server.close();
	}
});

test("a state file whose pid the daemon does not confirm is not running", async () => {
	const directory = temporary();
	const server = createServer((_request, response) => {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ name: "spool", version: "0.9.1", pid: 4242, startedAt: "now" }));
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const port = (server.address() as AddressInfo).port;
	try {
		const state = {
			host: "127.0.0.1",
			port,
			version: "0.9.1",
			startedAt: "now",
			controlToken: "secret",
		};
		writeFileSync(join(directory, "daemon.json"), JSON.stringify({ ...state, pid: 9 }));
		assert.deepEqual(await status(directory), { running: false });
		writeFileSync(join(directory, "daemon.json"), JSON.stringify({ ...state, pid: 4242 }));
		assert.deepEqual(await status(directory), {
			running: true,
			url: `http://127.0.0.1:${port}`,
			pid: 4242,
			version: "0.9.1",
			controlToken: "secret",
		});
	} finally {
		server.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test("nothing running is started, waited for, and stopped by pid", async () => {
	const directory = temporary();
	// A daemon in the shape this app cares about: it writes daemon.json, answers
	// /api/health as spool, and exits on SIGTERM. `start` never reads more.
	const cli = join(directory, "fake-cli.js");
	writeFileSync(
		cli,
		`
		const { createServer } = require("node:http");
		const { writeFileSync } = require("node:fs");
		const { join } = require("node:path");
		if (process.argv[2] !== "serve" || process.argv[3] !== "--foreground") process.exit(2);
		// what shim/electron-argv.js is for, asserted rather than assumed
		if (process.defaultApp !== true) process.exit(3);
		const directory = process.env.SPOOL_DIR;
		const server = createServer((_request, response) => {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ name: "spool", version: "9.9.9", pid: process.pid, startedAt: "now" }));
		});
		server.listen(0, "127.0.0.1", () => {
			writeFileSync(
				join(directory, "daemon.json"),
				JSON.stringify({
					pid: process.pid,
					host: "127.0.0.1",
					port: server.address().port,
					version: "9.9.9",
					startedAt: "now",
					controlToken: "secret",
				}),
			);
		});
		process.on("SIGTERM", () => process.exit(0));
		`,
	);
	try {
		assert.deepEqual(await status(directory), { running: false });
		const started = await start({
			execPath: process.execPath,
			nodeArgs: ["-r", join(__dirname, "..", "shim", "electron-argv.js")],
			cli,
			directory,
			env: { ...process.env, SPOOL_DIR: directory },
			timeoutMs: 15_000,
		});
		assert.equal(started.running, true);
		if (!started.running) return;
		assert.equal(started.version, "9.9.9");
		assert.ok(alive(started.pid));
		assert.equal(await stop(started.pid), true);
		assert.equal(alive(started.pid), false);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("stopping a pid that is already gone is a stop", async () => {
	assert.equal(await stop(0x7ffffff0), true);
});

test("the address a daemon would take is config.json's, with SPOOL_HOST and SPOOL_PORT on top", () => {
	const directory = temporary();
	assert.deepEqual(configuredAddress(directory, {}), { host: "127.0.0.1", port: 7766 });
	writeFileSync(join(directory, "config.json"), JSON.stringify({ host: "localhost", port: 7800 }));
	assert.deepEqual(configuredAddress(directory, {}), { host: "localhost", port: 7800 });
	assert.deepEqual(configuredAddress(directory, { SPOOL_PORT: "7767" }), { host: "localhost", port: 7767 });
	assert.deepEqual(configuredAddress(directory, { SPOOL_HOST: "::1", SPOOL_PORT: "x" }), { host: "::1", port: 7800 });
	// unreadable is the default, never a refusal: this only names a squatter
	writeFileSync(join(directory, "config.json"), "{");
	assert.deepEqual(configuredAddress(directory, {}), { host: "127.0.0.1", port: 7766 });
});
