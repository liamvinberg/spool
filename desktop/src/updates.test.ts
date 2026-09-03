import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AppUpdater } from "electron-updater";

// The updater, without Electron under it.
//
// electron-updater is stood in for through the require cache, which a dynamic
// import of a CommonJS module still goes through, so the module under test is
// the real one and only its dependency is the fake. Squirrel is a bare emitter
// handed in through the seam. What is worth pinning here is the wiring rather
// than the download: every one of these assertions is a mistake this code has
// already made once, and each of them fails silently in a packaged app, where
// there is no console to find out from.

/** Electron's autoUpdater, as far as this module can tell. */
const squirrel = new EventEmitter();
/** What Squirrel does once it has fetched the zip: nothing, accept, or refuse. */
let verdict: "ready" | "refused" | "silent" = "ready";

class FakeUpdater extends EventEmitter {
	autoDownload = true;
	autoInstallOnAppQuit = false;
	autoRunAppAfterInstall = false;
	logger: unknown = null;
	quitAndInstallCalls = 0;
	found: { isUpdateAvailable: boolean; updateInfo: { version: string } } | null = {
		isUpdateAvailable: true,
		updateInfo: { version: "0.12.0" },
	};
	downloaded = 0;
	/** Set to make downloadUpdate fail the way the real one does: emit, then reject. */
	downloadFailure: string | undefined;

	checkForUpdates(): Promise<unknown> {
		return Promise.resolve(this.found);
	}

	downloadUpdate(): Promise<string[]> {
		this.downloaded += 1;
		if (this.downloadFailure !== undefined) {
			this.emit("error", new Error(this.downloadFailure));
			return Promise.reject(new Error("Error: net::ERR_FAILED"));
		}
		for (const percent of [0.4, 12.2, 12.4, 99.6]) this.emit("download-progress", { percent });
		// The real one resolves when Squirrel has fetched the zip; Squirrel's own
		// verdict comes a beat later, on Electron's emitter, not this one.
		setImmediate(() => {
			if (verdict === "ready") squirrel.emit("update-downloaded");
			if (verdict === "refused") {
				const error = new Error("Code signature at URL file:///… did not pass validation");
				// electron-updater forwards Squirrel's error onto itself too.
				this.emit("error", error);
				squirrel.emit("error", error);
			}
		});
		return Promise.resolve(["/tmp/update.zip"]);
	}

	quitAndInstall(): void {
		this.quitAndInstallCalls += 1;
	}
}

const fake = new FakeUpdater();
const require_ = createRequire(__filename);
require_.cache[require_.resolve("electron-updater")] = {
	exports: { autoUpdater: fake as unknown as AppUpdater },
} as NodeJS.Module;

const {
	checkForUpdate,
	installUpdate,
	lastUpdaterError,
	nextCheckDelay,
	readCheckCache,
	relaunchIntoUpdate,
	UpdateCheckError,
	CHECK_INTERVAL_MS,
	FIRST_CHECK_DELAY_MS,
} = require_("./updates") as typeof import("./updates");

function silent(): void {}
const options = { squirrel: () => squirrel };

test("the download is staged with Squirrel, and its progress is whole percents that changed", async () => {
	const percents: number[] = [];
	await installUpdate(silent, (percent) => percents.push(percent), options);

	// The one that matters most. Squirrel is never handed the zip directly:
	// electron-updater serves it over loopback, and this flag is what makes
	// Squirrel ask for it. With it off, downloadUpdate resolves having installed
	// nothing and the relaunch has nothing to relaunch into.
	assert.equal(fake.autoInstallOnAppQuit, true);
	assert.equal(fake.autoRunAppAfterInstall, true);
	// Downloading is consented to in a dialog, not begun while it is read.
	assert.equal(fake.autoDownload, false);
	assert.notEqual(fake.logger, null);

	assert.deepEqual(percents, [0, 12, 100]);
	// No listener is left behind for the next check to double up on.
	assert.equal(fake.listenerCount("download-progress"), 0);
	assert.equal(squirrel.listenerCount("update-downloaded"), 0);
	assert.equal(squirrel.listenerCount("error"), 0);
});

test("an error event is always listened for, because an unheard one throws out of the main process", () => {
	assert.ok(fake.listenerCount("error") > 0);
});

test("a failure is reported as the reason the updater gave, not the bare rejection", async () => {
	fake.downloadFailure = "sha512 checksum mismatch";
	try {
		await installUpdate(silent, silent, options);
		assert.fail("a failed download resolved");
	} catch (error) {
		assert.ok(error instanceof UpdateCheckError);
		assert.match(error.message, /sha512 checksum mismatch/);
	}
	assert.equal(lastUpdaterError(), "sha512 checksum mismatch");
	assert.equal(fake.listenerCount("download-progress"), 0);
	assert.equal(squirrel.listenerCount("error"), 0);
	fake.downloadFailure = undefined;
});

test("Squirrel refusing the bundle is the rejection, with its reason, before anything is stopped", async () => {
	// The silent case this used to be: the zip downloaded, the daemon stopped,
	// the window blanked, and macOS had already refused the signature.
	verdict = "refused";
	try {
		await installUpdate(silent, silent, options);
		assert.fail("a refused bundle resolved");
	} catch (error) {
		assert.ok(error instanceof UpdateCheckError);
		assert.match(error.message, /Code signature/);
	}
	verdict = "ready";
	assert.equal(squirrel.listenerCount("update-downloaded"), 0);
});

test("a Squirrel that says nothing is given a deadline, not forever", async () => {
	verdict = "silent";
	await assert.rejects(
		() => installUpdate(silent, silent, { ...options, readyTimeoutMs: 20 }),
		/never said whether it accepts it/,
	);
	verdict = "ready";
});

test("a feed that names nothing newer is refused rather than downloaded", async () => {
	const before = fake.downloaded;
	fake.found = { isUpdateAvailable: false, updateInfo: { version: "0.11.0" } };
	await assert.rejects(() => installUpdate(silent, silent, options), UpdateCheckError);
	assert.equal(fake.downloaded, before);

	// null is what an unpackaged copy gets back, and it is not the same news.
	fake.found = null;
	await assert.rejects(() => installUpdate(silent, silent, options), /not packaged as a release/);
	fake.found = { isUpdateAvailable: true, updateInfo: { version: "0.12.0" } };
});

test("a check names the feed's version and whether it is newer, and downloads nothing", async () => {
	const before = fake.downloaded;
	assert.deepEqual(await checkForUpdate(silent), { latest: "0.12.0", newer: true });
	fake.found = { isUpdateAvailable: false, updateInfo: { version: "0.12.0" } };
	assert.deepEqual(await checkForUpdate(silent), { latest: "0.12.0", newer: false });
	fake.found = { isUpdateAvailable: true, updateInfo: { version: "0.12.0" } };
	assert.equal(fake.downloaded, before);
});

test("the relaunch goes to the updater that did the download", async () => {
	await installUpdate(silent, silent, options);
	relaunchIntoUpdate();
	assert.equal(fake.quitAndInstallCalls, 1);
});

test("the cadence: a launch inside the day never re-asks, one after it asks soon", () => {
	const now = Date.parse("2026-09-03T12:00:00Z");
	assert.equal(nextCheckDelay(undefined, now), FIRST_CHECK_DELAY_MS);
	assert.equal(nextCheckDelay({ latest: "0.13.0", checkedAt: "not a date" }, now), FIRST_CHECK_DELAY_MS);
	const hourAgo = { latest: "0.13.0", checkedAt: new Date(now - 60 * 60 * 1000).toISOString() };
	assert.equal(nextCheckDelay(hourAgo, now), CHECK_INTERVAL_MS - 60 * 60 * 1000);
	const twoDaysAgo = { latest: "0.13.0", checkedAt: new Date(now - 2 * CHECK_INTERVAL_MS).toISOString() };
	assert.equal(nextCheckDelay(twoDaysAgo, now), FIRST_CHECK_DELAY_MS);
});

test("the cache is machine-written ephemera: anything unreadable is absent", () => {
	const directory = mkdtempSync(join(tmpdir(), "spool-app-update-"));
	assert.equal(readCheckCache(directory), undefined);
	writeFileSync(join(directory, "app-update.json"), "{not json");
	assert.equal(readCheckCache(directory), undefined);
	writeFileSync(join(directory, "app-update.json"), JSON.stringify({ latest: 1, checkedAt: "x" }));
	assert.equal(readCheckCache(directory), undefined);
	writeFileSync(
		join(directory, "app-update.json"),
		JSON.stringify({ latest: "0.13.0", checkedAt: "2026-09-03T00:00:00Z" }),
	);
	assert.deepEqual(readCheckCache(directory), { latest: "0.13.0", checkedAt: "2026-09-03T00:00:00Z" });
});
