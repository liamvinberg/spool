import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { uncaughtNotice } from "./hand-notice";

/**
 * The one line a project with history off has earned (#253).
 *
 * Once per project rather than once a session, so the mark lives on disk
 * beside the rest of the app-owned state.
 */

function project(history: boolean): string {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "canvas.json", `{ "format": 1, "history": ${history} }\n`);
	return root;
}

it("says it once, and marks the project as told", () => {
	const root = project(false);
	expect(uncaughtNotice(root)).toBe(true);
	expect(existsSync(join(root, "design", ".spool", "hands.json"))).toBe(true);
	expect(uncaughtNotice(root)).toBe(false);
	expect(uncaughtNotice(root)).toBe(false);
});

it("says nothing at all to a project that keeps history", () => {
	const root = project(true);
	expect(uncaughtNotice(root)).toBe(false);
	expect(existsSync(join(root, "design", ".spool", "hands.json"))).toBe(false);
});
