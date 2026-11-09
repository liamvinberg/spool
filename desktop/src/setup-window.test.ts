import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { firstRunLikely, grownRect, setupSize, smallRect } from "./setup-window";

/** A desk display with the menu bar taken off the top, the way `screen` reports it. */
const DESK = { x: 0, y: 25, width: 1920, height: 1175 };
const LAPTOP = { x: 0, y: 25, width: 1280, height: 775 };

test("the setup window is small and centred, and grows back to where the window stood", () => {
	assert.deepEqual(smallRect(DESK), { x: 680, y: 373, w: 560, h: 480 });
	// a step that holds more is a little taller, still centred; the page can't ask for a big window this way
	assert.deepEqual(smallRect(DESK, { w: 560, h: 640 }), { x: 680, y: 293, w: 560, h: 640 });
	assert.deepEqual(setupSize({ w: 560, h: 5000 }), { w: 560, h: 800 });
	assert.equal(setupSize("small"), undefined);
	const before = { x: 100, y: 80, w: 1600, h: 1000 };
	assert.deepEqual(grownRect(before, DESK, [DESK]), before);
	// a first launch has nowhere it stood: the canvas's first size, centred, within the screen
	assert.deepEqual(grownRect(undefined, DESK, [DESK]), { x: 240, y: 163, w: 1440, h: 900 });
	assert.deepEqual(grownRect(undefined, LAPTOP, [LAPTOP]), { x: 0, y: 25, w: 1280, h: 775 });
	// where it stood on a display since unplugged is nowhere to grow to
	assert.deepEqual(grownRect({ x: 3000, y: 80, w: 1600, h: 1000 }, DESK, [DESK]), { x: 240, y: 163, w: 1440, h: 900 });
});

test("a first launch opens small until the setup is done or a project exists", () => {
	const dir = mkdtempSync(join(tmpdir(), "spool-setup-"));
	try {
		assert.equal(firstRunLikely(dir), true);
		writeFileSync(join(dir, "registry.json"), JSON.stringify({ projects: [{ root: "/a" }] }));
		assert.equal(firstRunLikely(dir), false);
		writeFileSync(join(dir, "registry.json"), JSON.stringify({ projects: [] }));
		writeFileSync(join(dir, "config.json"), JSON.stringify({ onboarding: { done: true } }));
		assert.equal(firstRunLikely(dir), false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
