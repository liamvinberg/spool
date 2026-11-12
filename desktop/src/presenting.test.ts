import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openLog } from "./log";
import { keepBarsHidden, loadPresenting, type PresentingModule, talkOptions } from "./presenting";

test("a talk hides the menu bar and the Dock in place of auto-hiding them, keeping every other option", () => {
	// a window full screen the macOS way: full screen, the menu bar and the Dock auto-hidden
	assert.equal(talkOptions(1024 | 4 | 1), 1024 | 8 | 2);
	assert.equal(talkOptions(0), 8 | 2);
	// a toolbar auto-hidden in full screen stays so
	assert.equal(talkOptions(2048 | 1024 | 4 | 1), 2048 | 1024 | 8 | 2);
});

test("a talk keeps the bars hidden, each time macOS puts the full screen's back while spool is in front, and never before", () => {
	const full = 1024 | 4 | 1;
	const talk = 1024 | 8 | 2;
	let options = talk;
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
	const look = () => waits.shift()?.();
	let hiding = true;
	let inFront = true;
	keepBarsHidden(
		() => hiding,
		() => inFront,
		native,
		(next) => waits.push(next),
	);
	look();
	assert.deepEqual(set, []);
	// another app in front: what spool's options read then is not what it gets back
	inFront = false;
	options = 1024;
	look();
	assert.deepEqual(set, []);
	// back in front, in the middle of the Space's slide (or in Mission Control): options set now would outlast the talk
	inFront = true;
	options = 0;
	look();
	assert.deepEqual(set, []);
	options = full;
	look();
	assert.deepEqual(set, [talk]);
	// macOS puts them back once more as the slide ends, and again whenever spool comes back, however long the talk
	options = full;
	look();
	look();
	assert.deepEqual(set, [talk, talk]);
	for (let turn = 0; turn < 10_000; turn++) look();
	options = full;
	look();
	assert.deepEqual(set, [talk, talk, talk]);
	// the talk over, it stops looking
	hiding = false;
	options = full;
	look();
	assert.deepEqual(set, [talk, talk, talk]);
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
