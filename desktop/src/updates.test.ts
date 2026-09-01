import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import type { AppUpdater } from "electron-updater";

// The updater, without Electron under it.
//
// electron-updater is stood in for through the require cache, which a dynamic
// import of a CommonJS module still goes through, so the module under test is
// the real one and only its dependency is the fake. What is worth pinning here
// is the wiring rather than the download: every one of these assertions is a
// mistake this code has already made once, and each of them fails silently in a
// packaged app, where there is no console to find out from.

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

const { installUpdate, lastUpdaterError, relaunchIntoUpdate, UpdateCheckError } = require_(
	"./updates",
) as typeof import("./updates");

function silent(): void {}

test("the download is staged with Squirrel, and its progress is whole percents that changed", async () => {
	const percents: number[] = [];
	await installUpdate(silent, (percent) => percents.push(percent));

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
});

test("an error event is always listened for, because an unheard one throws out of the main process", () => {
	assert.ok(fake.listenerCount("error") > 0);
});

test("a failure is reported as the reason the updater gave, not the bare rejection", async () => {
	fake.downloadFailure = "sha512 checksum mismatch";
	try {
		await installUpdate(silent, silent);
		assert.fail("a failed download resolved");
	} catch (error) {
		assert.ok(error instanceof UpdateCheckError);
		assert.match(error.message, /sha512 checksum mismatch/);
	}
	assert.equal(lastUpdaterError(), "sha512 checksum mismatch");
	assert.equal(fake.listenerCount("download-progress"), 0);
	fake.downloadFailure = undefined;
});

test("a feed that names nothing newer is refused rather than downloaded", async () => {
	const before = fake.downloaded;
	fake.found = { isUpdateAvailable: false, updateInfo: { version: "0.11.0" } };
	await assert.rejects(() => installUpdate(silent, silent), UpdateCheckError);
	assert.equal(fake.downloaded, before);

	// null is what an unpackaged copy gets back, and it is not the same news.
	fake.found = null;
	await assert.rejects(() => installUpdate(silent, silent), /not packaged as a release/);
	fake.found = { isUpdateAvailable: true, updateInfo: { version: "0.12.0" } };
});

test("the relaunch goes to the updater that did the download", async () => {
	await installUpdate(silent, silent);
	relaunchIntoUpdate();
	assert.equal(fake.quitAndInstallCalls, 1);
});
