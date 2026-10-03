import { mkdirSync, realpathSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { createLooks, diskNow, SETTLED_MS, witnessHolds, witnessSource } from "./source-witness";

/**
 * A witness speaks for a frame only when a stat can (#109): every path it names
 * must have stood still since well before the read that built the frame began,
 * or two writes inside one timestamp tick could pass for one.
 */

/** A one-file frame whose folder is the whole design folder. */
function oneFile(text: string): { dir: string; file: string } {
	const dir = realpathSync(makeTempDir());
	const file = join(dir, "frame.tsx");
	writeFileSync(file, text);
	return { dir, file };
}

const listed = (dir: string, file: string) => ({ files: [file], folders: [dir], linked: false });

it("takes no witness of a path that changed too near the read", () => {
	const { dir, file } = oneFile("export default () => null;\n");
	const source = { files: [file], imports: [] };
	const since = Number(statSync(file).mtimeMs);

	// the read began as the file was written: inside the settling window
	expect(witnessSource(dir, dir, listed(dir, file), source, since, createLooks())).toBeUndefined();
	// the same file, once the read is far enough past its last change
	expect(witnessSource(dir, dir, listed(dir, file), source, since + SETTLED_MS + 1000, createLooks())).toBeDefined();
	// a read that could not tell the file system's time takes none at all
	expect(witnessSource(dir, dir, listed(dir, file), source, undefined, createLooks())).toBeUndefined();
});

it("takes no witness of a folder holding a link", () => {
	const { dir, file } = oneFile("export default () => null;\n");
	const source = { files: [file], imports: [] };

	expect(
		witnessSource(dir, dir, { ...listed(dir, file), linked: true }, source, Date.now() + 3_600_000, createLooks()),
	).toBeUndefined();
});

it("stops holding once a file in it is rewritten at the same size", () => {
	const { dir, file } = oneFile("export const a = 1;\n");
	// written an hour ago, as the read an hour from now takes it to be: a rewrite
	// inside the same timestamp tick as the first write (4 ms on Linux) is the one
	// change a stat cannot see, which is why a witness waits for paths to settle
	const settled = new Date(Date.now() - 3_600_000);
	utimesSync(file, settled, settled);
	const source = { files: [file], imports: [] };
	const witness = witnessSource(dir, dir, listed(dir, file), source, Date.now() + 3_600_000, createLooks());
	if (witness === undefined) throw new Error("expected a witness");
	expect(witnessHolds(witness, createLooks())).toBe(true);

	writeFileSync(file, "export const b = 1;\n");

	expect(witnessHolds(witness, createLooks())).toBe(false);
});

it("tells the file system's time from a probe in the project's own app state", () => {
	const designDir = realpathSync(makeTempDir());
	mkdirSync(join(designDir, "frames"));
	const before = statSync(designDir).mtimeMs;

	const now = diskNow(designDir);

	// the probe's own timestamp, never the machine's clock
	expect(Math.abs((now ?? 0) - statSync(join(designDir, ".spool", "clock")).ctimeMs)).toBeLessThan(1);
	expect(now).toBeGreaterThanOrEqual(Math.floor(before));
});
