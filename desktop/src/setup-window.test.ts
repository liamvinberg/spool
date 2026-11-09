import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("a first launch opens small until the setup is done, never where spool was used before it", () => {
	const dir = mkdtempSync(join(tmpdir(), "spool-setup-"));
	try {
		assert.equal(firstRunLikely(dir), true);
		// a used state folder the daemon hasn't decided yet: it will exempt it
		writeFileSync(join(dir, "registry.json"), JSON.stringify({ projects: [] }));
		assert.equal(firstRunLikely(dir), false);
		// once decided, the decision
		writeFileSync(join(dir, "config.json"), JSON.stringify({ onboarding: { done: false } }));
		assert.equal(firstRunLikely(dir), true);
		writeFileSync(join(dir, "config.json"), JSON.stringify({ onboarding: { done: true } }));
		assert.equal(firstRunLikely(dir), false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a Mac signed in to Spool Cloud before the first run existed opens big, known by the Keychain item's name alone", () => {
	const dir = mkdtempSync(join(tmpdir(), "spool-setup-"));
	try {
		const spoolDir = join(dir, "state");
		mkdirSync(spoolDir);
		// the Keychain item spool's keychainVault keeps a session in, as the daemon names it
		const authority = "https://spool.page";
		const hash = (text: string) => createHash("sha256").update(text).digest("base64url");
		const account = hash(`${authority}\0${spoolDir}`);
		const service = `spool.device-session.${hash(authority)}`;
		const calls = join(dir, "calls");
		mkdirSync(join(dir, "bin"));
		writeFileSync(
			join(dir, "bin", "security"),
			`#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\n[ "$*" = "find-generic-password -a ${account} -s ${service}" ]\n`,
			{ mode: 0o755 },
		);
		const env = { PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}` };
		const path = process.env.PATH;
		process.env.PATH = env.PATH;
		try {
			assert.equal(firstRunLikely(spoolDir, "darwin"), false);
			assert.equal(firstRunLikely(join(dir, "other"), "darwin"), true);
			// never the secret: a `-w` read is what makes a Mac ask the person
			assert.doesNotMatch(readFileSync(calls, "utf8"), /-w/);
			// elsewhere the session is a file in the state folder, which the folder check already sees
			assert.equal(firstRunLikely(spoolDir, "linux"), true);
		} finally {
			process.env.PATH = path;
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
