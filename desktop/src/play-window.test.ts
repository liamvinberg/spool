import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	fitRect,
	readRect,
	readRects,
	rectIsReachable,
	rectKey,
	sameRect,
	storePath,
	type WindowRect,
	writeRect,
} from "./play-window";

/** A desk display with the menu bar taken off the top, the way `screen` reports it. */
const DESK = { x: 0, y: 25, width: 1920, height: 1175 };

function temporary(): string {
	return mkdtempSync(join(tmpdir(), "spool-play-"));
}

test("a tall frame takes the screen's height and snaps to its right edge", () => {
	assert.deepEqual(fitRect({ w: 1200, h: 2400 }, DESK), { x: 720, y: 25, w: 1200, h: 1175 });
});

test("a phone frame keeps the height it was authored at, centred", () => {
	// The whole argument: 844 and stop. Stretching it to 1175 would invent a
	// device nobody has, which is the same lie as scaling.
	assert.deepEqual(fitRect({ w: 390, h: 844 }, DESK), { x: 1530, y: 191, w: 390, h: 844 });
});

test("a frame exactly the screen's height is not centred by a rounding error", () => {
	assert.deepEqual(fitRect({ w: 800, h: 1175 }, DESK), { x: 1120, y: 25, w: 800, h: 1175 });
});

test("an odd leftover rounds rather than landing on a half pixel", () => {
	const rect = fitRect({ w: 400, h: 1000 }, DESK);
	assert.equal(rect.y, 25 + 88);
	assert.equal(Number.isInteger(rect.y), true);
});

test("a frame wider than the screen is capped, never hung off the left edge", () => {
	assert.deepEqual(fitRect({ w: 2400, h: 1000 }, DESK), { x: 0, y: 113, w: 1920, h: 1000 });
});

test("the second display's own coordinates are the ones it snaps to", () => {
	const second = { x: 1920, y: 0, width: 1440, height: 900 };
	assert.deepEqual(fitRect({ w: 390, h: 844 }, second), { x: 2970, y: 28, w: 390, h: 844 });
});

test("the key is per project and per authored width, and never ambiguous", () => {
	assert.equal(rectKey("kaffe", 1200), "1200:kaffe");
	assert.notEqual(rectKey("kaffe", 390), rectKey("kaffe", 1200));
	assert.notEqual(rectKey("kaffe", 390), rectKey("tidemark", 390));
	// A project name may hold a colon; the width is digits and comes first, so
	// two different projects can never collide on one key.
	assert.notEqual(rectKey("a:b", 390), rectKey("a", 390));
});

test("a rect on a display that is gone is no longer a preference", () => {
	const onDesk: WindowRect = { x: 720, y: 25, w: 1200, h: 1175 };
	assert.equal(rectIsReachable(onDesk, [DESK]), true);
	// Where a second display used to be.
	assert.equal(rectIsReachable({ x: 2400, y: 100, w: 800, h: 600 }, [DESK]), false);
	assert.equal(
		rectIsReachable({ x: 2400, y: 100, w: 800, h: 600 }, [DESK, { x: 1920, y: 0, width: 1440, height: 900 }]),
		true,
	);
});

test("a window whose bar hangs below the screen cannot be grabbed", () => {
	assert.equal(rectIsReachable({ x: 400, y: 1300, w: 800, h: 600 }, [DESK]), false);
	// A sliver on screen is not a handle either.
	assert.equal(rectIsReachable({ x: 1900, y: 100, w: 800, h: 600 }, [DESK]), false);
});

test("nothing remembered reads as nothing, however broken the file is", () => {
	const directory = temporary();
	try {
		assert.deepEqual(readRects(directory), {});
		writeFileSync(storePath(directory), "{ not json");
		assert.deepEqual(readRects(directory), {});
		writeFileSync(storePath(directory), JSON.stringify({ windows: "no" }));
		assert.deepEqual(readRects(directory), {});
		writeFileSync(storePath(directory), JSON.stringify({ windows: { "1200:kaffe": { x: 1, y: 2, w: 0, h: 4 } } }));
		assert.deepEqual(readRects(directory), {});
		writeFileSync(storePath(directory), JSON.stringify({ windows: { "1200:kaffe": { x: "1", y: 2, w: 3, h: 4 } } }));
		assert.deepEqual(readRects(directory), {});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("a rect written is a rect read back, and one forgotten is gone", () => {
	const directory = temporary();
	try {
		const phone = rectKey("kaffe", 390);
		const desktop = rectKey("kaffe", 1200);
		writeRect(directory, desktop, { x: 1012, y: 156, w: 830, h: 1000 });
		writeRect(directory, phone, { x: 40, y: 60, w: 390, h: 844 });
		assert.deepEqual(readRect(directory, desktop), { x: 1012, y: 156, w: 830, h: 1000 });
		// A phone frame never inherits a desktop frame's rectangle.
		assert.deepEqual(readRect(directory, phone), { x: 40, y: 60, w: 390, h: 844 });

		writeRect(directory, desktop, undefined);
		assert.equal(readRect(directory, desktop), undefined);
		assert.deepEqual(readRect(directory, phone), { x: 40, y: 60, w: 390, h: 844 });

		// Forgetting what was never remembered writes nothing and throws nothing.
		writeRect(directory, desktop, undefined);
		assert.equal(readRect(directory, desktop), undefined);
		assert.equal(JSON.parse(readFileSync(storePath(directory), "utf8")).windows[phone].w, 390);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("a rect standing exactly where the frame would have put it is not a preference", () => {
	// What keeps reset from re-remembering the window it just put back: the
	// move its own setBounds fires arrives at the fit rect, and this is false.
	const fit = fitRect({ w: 1200, h: 2400 }, DESK);
	assert.equal(sameRect(fit, fitRect({ w: 1200, h: 2400 }, DESK)), true);
	assert.equal(sameRect({ ...fit, x: fit.x - 1 }, fit), false);
	assert.equal(sameRect({ ...fit, h: fit.h - 1 }, fit), false);
});
