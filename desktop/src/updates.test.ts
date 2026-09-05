import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import type { CancellationToken as Token } from "electron-updater";
import type { InstallProgress } from "./updates";

const require_ = createRequire(__filename);
const { CancellationToken } = require_("electron-updater") as typeof import("electron-updater");
const squirrel = new EventEmitter();
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const silent = () => {};

// Only the network and macOS are stood in for. The module under test is the
// real one; each test gets a fresh instance, as a new app process would.
class FakeUpdater extends EventEmitter {
	autoDownload = true;
	autoInstallOnAppQuit = false;
	autoRunAppAfterInstall = false;
	disableDifferentialDownload = true;
	logger: unknown = null;
	quitAndInstallCalls = 0;
	downloaded = 0;
	found: { isUpdateAvailable: boolean; updateInfo: { version: string } } | null = null;
	check = async () => this.found;
	download: (token: Token) => Promise<string[]> = async () => [];

	checkForUpdates() {
		return this.check();
	}
	downloadUpdate(token: Token) {
		this.downloaded++;
		return this.download(token);
	}
	quitAndInstall() {
		this.quitAndInstallCalls++;
	}
}
const fake = new FakeUpdater();
require_.cache[require_.resolve("electron-updater")] = {
	exports: { autoUpdater: fake, CancellationToken },
} as NodeJS.Module;
let api: typeof import("./updates");
const options = { squirrel: () => squirrel };

function downloaded(): void {
	fake.emit("update-downloaded", { version: fake.found?.updateInfo.version });
}
function bytes(transferred: number, total = 1_000_000): void {
	fake.emit("download-progress", {
		percent: (transferred / total) * 100,
		transferred,
		total,
		bytesPerSecond: 100_000,
	});
}

beforeEach(() => {
	fake.removeAllListeners();
	squirrel.removeAllListeners();
	fake.downloaded = 0;
	fake.quitAndInstallCalls = 0;
	fake.found = { isUpdateAvailable: true, updateInfo: { version: "0.12.0" } };
	fake.check = async () => fake.found;
	fake.download = async () => {
		for (const transferred of [4_000, 122_000, 124_000, 996_000]) bytes(transferred);
		downloaded();
		setImmediate(() => squirrel.emit("update-downloaded"));
		return ["/tmp/update.zip"];
	};
	delete require_.cache[require_.resolve("./updates")];
	api = require_("./updates") as typeof import("./updates");
});

test("download progress never rounds up to completion and preparation waits for macOS", async () => {
	const states: InstallProgress[] = [];
	assert.equal(await api.installUpdate(silent, (state) => states.push(state), options), "0.12.0");
	assert.deepEqual(states, [
		{ kind: "downloading", version: "0.12.0", percent: 0 },
		{ kind: "downloading", version: "0.12.0", percent: 12 },
		{ kind: "downloading", version: "0.12.0", percent: 99 },
		{ kind: "preparing", version: "0.12.0" },
	]);
	assert.equal(fake.autoDownload, false);
	assert.equal(fake.autoInstallOnAppQuit, true);
	assert.equal(fake.autoRunAppAfterInstall, true);
	assert.equal(fake.disableDifferentialDownload, false);
	assert.notEqual(fake.logger, null);
	assert.equal(fake.listenerCount("download-progress"), 0);
	assert.equal(fake.listenerCount("update-downloaded"), 0);
	assert.equal(squirrel.listenerCount("update-downloaded"), 0);
	assert.equal(squirrel.listenerCount("error"), 0);
	assert.equal(fake.listenerCount("error"), 1);
});

test("the verified version is the one the feed actually downloaded", async () => {
	fake.found = { isUpdateAvailable: true, updateInfo: { version: "0.13.0" } };
	assert.equal(await api.installUpdate(silent, silent, options), "0.13.0");
});

test("a cached archive without download progress still enters preparation", async () => {
	fake.download = async () => {
		downloaded();
		squirrel.emit("update-downloaded");
		return ["/tmp/cached.zip"];
	};
	const states: InstallProgress[] = [];
	await api.installUpdate(silent, (state) => states.push(state), options);
	assert.deepEqual(
		states.map((state) => state.kind),
		["downloading", "preparing"],
	);
});

test("fetching the archive does not permit relaunch before macOS has verified it", async () => {
	fake.download = async () => {
		downloaded();
		return ["/tmp/update.zip"];
	};
	let settled = false;
	const work = api.installUpdate(silent, silent, options).then(() => {
		settled = true;
	});
	await turn();
	assert.equal(settled, false);
	assert.throws(() => api.relaunchIntoUpdate(), /not been verified/);
	squirrel.emit("update-downloaded");
	await work;
	assert.equal(settled, true);
});

test("a failed download retains the useful error and can be retried", async () => {
	const succeeds = fake.download;
	fake.download = async () => {
		fake.emit("error", new Error("sha512 checksum mismatch"));
		throw new Error("net::ERR_FAILED");
	};
	await assert.rejects(api.installUpdate(silent, silent, options), (error: unknown) => {
		assert.ok(error instanceof api.UpdateCheckError);
		assert.match(error.message, /sha512 checksum mismatch/);
		assert.equal(error.retryable, true);
		return true;
	});
	assert.equal(api.lastUpdaterError(), "sha512 checksum mismatch");
	fake.download = succeeds;
	await api.installUpdate(silent, silent, options);
	assert.equal(fake.downloaded, 2);
});

test("a native refusal is reported without permitting another native handoff", async () => {
	fake.download = async () => {
		downloaded();
		squirrel.emit("error", new Error("Code signature did not pass validation"));
		return ["/tmp/update.zip"];
	};
	await assert.rejects(api.installUpdate(silent, silent, options), (error: unknown) => {
		assert.ok(error instanceof api.UpdateCheckError);
		assert.match(error.message, /Code signature/);
		assert.equal(error.retryable, false);
		return true;
	});
	await assert.rejects(api.installUpdate(silent, silent, options), /Restart Spool/);
	assert.equal(fake.downloaded, 1);
	assert.equal(fake.quitAndInstallCalls, 0);
});

test("the preparation deadline includes a Squirrel that never fetches the local archive", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	fake.download = () => {
		downloaded();
		return new Promise(() => {});
	};
	const work = api.installUpdate(silent, silent, { ...options, readyTimeoutMs: 90 });
	const rejected = assert.rejects(work, /macOS did not finish preparing/);
	await turn();
	t.mock.timers.tick(90);
	await rejected;
	// A late native success cannot settle a second attempt or relaunch the app.
	squirrel.emit("update-downloaded");
	await assert.rejects(api.installUpdate(silent, silent, options), /Restart Spool/);
	assert.equal(fake.downloaded, 1);
	assert.equal(fake.quitAndInstallCalls, 0);
	assert.equal(squirrel.listenerCount("update-downloaded"), 0);
});

test("a download with no arriving bytes is cancelled, and retry waits for cancellation", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let cancelled = false;
	const succeeds = fake.download;
	fake.download = (token) =>
		token.createPromise((_resolve, _reject, onCancel) => {
			onCancel(() => {
				cancelled = true;
			});
		});
	const work = api.installUpdate(silent, silent, { ...options, downloadIdleTimeoutMs: 120 });
	const rejected = assert.rejects(work, /stopped making progress/);
	await turn();
	t.mock.timers.tick(120);
	await rejected;
	assert.equal(cancelled, true);
	fake.download = succeeds;
	await api.installUpdate(silent, silent, options);
});

test("arriving bytes below one percent keep a slow download alive", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let finish = () => {};
	fake.download = () =>
		new Promise((resolve) => {
			finish = () => resolve(["/tmp/update.zip"]);
		});
	const work = api.installUpdate(silent, silent, { ...options, downloadIdleTimeoutMs: 120 });
	await turn();
	for (let count = 1; count <= 5; count++) {
		t.mock.timers.tick(100);
		bytes(count);
	}
	downloaded();
	finish();
	squirrel.emit("update-downloaded");
	await work;
});

test("an uncancellable transfer blocks retry even if it later completes", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let finish = () => {};
	fake.download = () =>
		new Promise((resolve) => {
			finish = () => resolve(["/tmp/update.zip"]);
		});
	const work = api.installUpdate(silent, silent, { ...options, downloadIdleTimeoutMs: 120 });
	const rejected = assert.rejects(work, (error: unknown) => {
		assert.ok(error instanceof api.UpdateCheckError);
		assert.equal(error.retryable, false);
		assert.match(error.message, /Restart Spool/);
		return true;
	});
	await turn();
	t.mock.timers.tick(120);
	await turn();
	t.mock.timers.tick(5_000);
	await rejected;
	finish();
	await assert.rejects(api.installUpdate(silent, silent, options), /Restart Spool/);
});

test("a handoff that races cancellation cannot make retry available", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	fake.download = (token) =>
		token.createPromise((_resolve, _reject, onCancel) => {
			onCancel(() => downloaded());
		});
	const states: InstallProgress[] = [];
	const work = api.installUpdate(silent, (state) => states.push(state), { ...options, downloadIdleTimeoutMs: 120 });
	const rejected = assert.rejects(work, (error: unknown) => {
		assert.ok(error instanceof api.UpdateCheckError);
		assert.equal(error.retryable, false);
		return true;
	});
	await turn();
	t.mock.timers.tick(120);
	await rejected;
	assert.equal(
		states.some((state) => state.kind === "preparing"),
		false,
	);
	await assert.rejects(api.installUpdate(silent, silent, options), /Restart Spool/);
});

test("repeated progress with no new bytes does not hide a stalled download", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	fake.download = (token) => token.createPromise(() => {});
	const work = api.installUpdate(silent, silent, { ...options, downloadIdleTimeoutMs: 120 });
	const rejected = assert.rejects(work, /stopped making progress/);
	await turn();
	bytes(1);
	t.mock.timers.tick(100);
	bytes(1);
	t.mock.timers.tick(20);
	await rejected;
});

test("a stalled check has a deadline and its late answer never starts a download", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let finish = () => {};
	fake.check = () =>
		new Promise((resolve) => {
			finish = () => resolve(fake.found);
		});
	const work = api.installUpdate(silent, silent, { ...options, checkTimeoutMs: 30 });
	const rejected = assert.rejects(work, /Checking for updates timed out/);
	await turn();
	t.mock.timers.tick(30);
	await rejected;
	finish();
	await turn();
	assert.equal(fake.downloaded, 0);
});

test("parallel install calls never start a second download", async () => {
	const first = api.installUpdate(silent, silent, options);
	await assert.rejects(api.installUpdate(silent, silent, options), /already in progress/);
	await first;
	assert.equal(fake.downloaded, 1);
});

test("a feed with no update is refused without downloading", async () => {
	fake.found = { isUpdateAvailable: false, updateInfo: { version: "0.11.0" } };
	await assert.rejects(api.installUpdate(silent, silent, options), /not newer/);
	fake.found = null;
	await assert.rejects(api.installUpdate(silent, silent, options), /not packaged/);
	assert.equal(fake.downloaded, 0);
});

test("checks report the feed's version without downloading and configure listeners once", async () => {
	const checks = await Promise.all([api.checkForUpdate(silent), api.checkForUpdate(silent)]);
	assert.deepEqual(checks, [
		{ latest: "0.12.0", newer: true },
		{ latest: "0.12.0", newer: true },
	]);
	assert.equal(fake.listenerCount("error"), 1);
	assert.equal(fake.downloaded, 0);
});

test("the relaunch uses the same updater that staged the archive", async () => {
	await api.installUpdate(silent, silent, options);
	api.relaunchIntoUpdate();
	assert.equal(fake.quitAndInstallCalls, 1);
});

test("the cadence honours the last check and treats invalid timestamps as absent", () => {
	const now = Date.parse("2026-09-03T12:00:00Z");
	assert.equal(api.nextCheckDelay(undefined, now), api.FIRST_CHECK_DELAY_MS);
	assert.equal(api.nextCheckDelay({ latest: "0.13.0", checkedAt: "not a date" }, now), api.FIRST_CHECK_DELAY_MS);
	assert.equal(
		api.nextCheckDelay({ latest: "0.13.0", checkedAt: new Date(now - 3_600_000).toISOString() }, now),
		api.CHECK_INTERVAL_MS - 3_600_000,
	);
	assert.equal(
		api.nextCheckDelay({ latest: "0.13.0", checkedAt: new Date(now - 2 * api.CHECK_INTERVAL_MS).toISOString() }, now),
		api.FIRST_CHECK_DELAY_MS,
	);
});

test("an unreadable check cache is absent", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "spool-app-update-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	assert.equal(api.readCheckCache(directory), undefined);
	writeFileSync(join(directory, "app-update.json"), "{not json");
	assert.equal(api.readCheckCache(directory), undefined);
	writeFileSync(join(directory, "app-update.json"), JSON.stringify({ latest: 1, checkedAt: "x" }));
	assert.equal(api.readCheckCache(directory), undefined);
	const cache = { latest: "0.13.0", checkedAt: "2026-09-03T00:00:00Z" };
	writeFileSync(join(directory, "app-update.json"), JSON.stringify(cache));
	assert.deepEqual(api.readCheckCache(directory), cache);
});
