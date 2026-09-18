import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	beginUpdateRestart,
	clearUpdateRestart,
	RESTART_WINDOW_MS,
	updateRestartState,
	updateRestartWorkspace,
} from "./update-restart";

test("restart handoff survives a new process without keeping the updated app out", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "spool-restart-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	assert.equal(updateRestartState(directory, "0.21.1", 1000), "none");
	beginUpdateRestart(directory, "0.21.2", 1000);
	assert.equal(updateRestartState(directory, "0.21.1", 31_000), "waiting");
	assert.equal(updateRestartState(directory, "0.21.2", 31_000), "completed");
	assert.equal(updateRestartState(directory, "0.22.0", 31_000), "completed");
	assert.equal(updateRestartState(directory, "0.21.1", 1000 + RESTART_WINDOW_MS), "expired");
	assert.equal(updateRestartState(directory, "0.21.1", 999), "expired");
	clearUpdateRestart(directory);
	assert.equal(updateRestartState(directory, "0.21.1"), "none");
	writeFileSync(join(directory, "app-update-restart.json"), '{"target":3}');
	assert.equal(updateRestartState(directory, "0.21.1"), "none");
});

test("the replacement restores only a local canvas path", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "spool-restart-path-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	beginUpdateRestart(directory, "0.22.1", Date.now(), { path: "/p/my%20project" });
	assert.equal(updateRestartWorkspace(directory).path, "/p/my%20project");
	for (const path of ["https://example.com", "//example.com", "/p/a?token=secret", "/api/health"]) {
		beginUpdateRestart(directory, "0.22.1", Date.now(), { path });
		assert.equal(updateRestartWorkspace(directory).path, undefined);
	}
});

test("restores window preferences and ignores invalid dimensions", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "spool-restart-window-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const workspace = {
		path: "/p/design",
		rect: { x: -900, y: 80, w: 1100, h: 720 },
		maximized: false,
		fullscreen: true,
	};
	beginUpdateRestart(directory, "0.24.1", Date.now(), workspace);
	assert.deepEqual(updateRestartWorkspace(directory), workspace);
	for (const w of [0, -1, 32769, Number.POSITIVE_INFINITY]) {
		beginUpdateRestart(directory, "0.24.1", Date.now(), { ...workspace, rect: { ...workspace.rect, w } });
		assert.equal(updateRestartWorkspace(directory).rect, undefined);
	}
});
