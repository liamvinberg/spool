import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openLog } from "./log";
import { hideBarsOnReturn, loadPresenting, type PresentingModule, talkOptions } from "./presenting";

test("a talk hides the menu bar and the Dock in place of auto-hiding them, keeping every other option", () => {
	// a window full screen the macOS way: full screen, the menu bar and the Dock auto-hidden
	assert.equal(talkOptions(1024 | 4 | 1), 1024 | 8 | 2);
	assert.equal(talkOptions(0), 8 | 2);
	// a toolbar auto-hidden in full screen stays so
	assert.equal(talkOptions(2048 | 1024 | 4 | 1), 2048 | 1024 | 8 | 2);
});

test("back in front of its full screen window, a talk hides the bars each time macOS puts the full screen's back, and not before", () => {
	const full = 1024 | 4 | 1;
	let options = 0;
	const set: number[] = [];
	const native: PresentingModule = {
		options: () => options,
		setOptions(next) {
			set.push(next);
			options = next;
			return true;
		},
		immediately() {},
	};
	const waits: (() => void)[] = [];
	const later = (next: () => void) => waits.push(next);
	const look = () => waits.shift()?.();
	let hiding = true;
	// spool in front again, in the middle of the Space's slide: options set now would outlast the talk
	hideBarsOnReturn(() => hiding, native, later);
	look();
	assert.deepEqual(set, []);
	options = full;
	look();
	assert.deepEqual(set, [1024 | 8 | 2]);
	// the slide done, macOS puts them back once more
	options = full;
	look();
	look();
	assert.deepEqual(set, [1024 | 8 | 2, 1024 | 8 | 2]);
	// and after a while it stops looking
	for (let turn = 0; turn < 1000 && waits.length > 0; turn++) look();
	assert.equal(waits.length, 0);
	// a talk that ends meanwhile wants nothing hidden
	options = 0;
	hideBarsOnReturn(() => hiding, native, later);
	hiding = false;
	options = full;
	look();
	assert.equal(set.length, 2);
	assert.equal(waits.length, 0);
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
