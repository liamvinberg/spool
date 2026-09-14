import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("the play preload exposes only the native reset boundary retained by the accepted bar", () => {
	const preload = readFileSync(join(__dirname, "play-preload.js"), "utf8");
	assert.match(preload, /spoolPlayWindow/);
	assert.match(preload, /spool:play-window-restored/);
	assert.match(preload, /spool:play-window-reset/);
	assert.doesNotMatch(preload, /spool:play-window-canvas/);
	assert.doesNotMatch(preload, /spool:play-window-close/);
	assert.doesNotMatch(preload, /ipcRenderer\s*:/);
});

test("the main process keeps reset scoped to tracked play webContents", () => {
	const main = readFileSync(join(__dirname, "main.js"), "utf8");
	assert.match(main, /spool:play-window-reset/);
	assert.match(main, /played\.get\(event\.sender\.id\)/);
	assert.match(main, /trafficLightPosition:\s*\{\s*x:\s*12/);
	assert.doesNotMatch(main, /spool:play-window-canvas/);
	assert.doesNotMatch(main, /spool:play-window-close/);
});
