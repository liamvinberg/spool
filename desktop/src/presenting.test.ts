import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openLog } from "./log";
import { loadPresenting, talkOptions } from "./presenting";

test("a talk hides the menu bar and the Dock in place of auto-hiding them, keeping every other option", () => {
	// a window full screen the macOS way: full screen, the menu bar and the Dock auto-hidden
	assert.equal(talkOptions(1024 | 4 | 1), 1024 | 8 | 2);
	assert.equal(talkOptions(0), 8 | 2);
	// a toolbar auto-hidden in full screen stays so
	assert.equal(talkOptions(2048 | 1024 | 4 | 1), 2048 | 1024 | 8 | 2);
});

test("a module that will not load leaves presenting as it was, and says so in the log", () => {
	const directory = mkdtempSync(join(tmpdir(), "spool-presenting-"));
	try {
		openLog(directory);
		const file = join(directory, "presenting.node");
		writeFileSync(file, "not a module");
		assert.equal(loadPresenting(file, "linux"), undefined);
		assert.doesNotMatch(readLog(directory), /FAIL native/);
		assert.equal(loadPresenting(file, "darwin"), undefined);
		assert.match(readLog(directory), /\tpresent\tFAIL native\t/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

function readLog(directory: string): string {
	try {
		return readFileSync(join(directory, "app.log"), "utf8");
	} catch {
		return "";
	}
}
