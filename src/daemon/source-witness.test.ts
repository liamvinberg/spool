import { mkdirSync, realpathSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { createSourcePass, frameSourceIn } from "./nav-sites";
import { createLooks, diskNow, SETTLED_MS, witnessHolds, witnessSource } from "./source-witness";

/**
 * A witness speaks for a frame by a stat only where a stat can (#109): a path
 * must have stood still since well before the read that built the frame began,
 * or two writes inside one timestamp tick could pass for one. Everywhere else,
 * and wherever a stat moved, it speaks by what the path holds.
 */

/** One read of the project, as a build makes it. */
const reading = (dir: string) => {
	const pass = createSourcePass(dir);
	return { pass, looks: createLooks() };
};

/** A one-file frame whose folder is the whole design folder. */
function oneFile(text: string): { dir: string; file: string } {
	const dir = realpathSync(makeTempDir());
	const file = join(dir, "frame.tsx");
	writeFileSync(file, text);
	return { dir, file };
}

const listed = (dir: string, file: string) => ({ files: [file], folders: [dir], linked: false });

it("proves a path that changed too near the read by its contents until it settles", () => {
	const { dir, file } = oneFile("export const a = 1;\n");
	const source = { files: [file], imports: [] };
	const since = Number(statSync(file).mtimeMs);
	const { pass, looks } = reading(dir);

	// the read began as the file was written: inside the settling window, its stat is no identity
	const fresh = witnessSource(dir, dir, listed(dir, file), source, since, looks, pass.digest);
	if (fresh === undefined) throw new Error("expected a witness");
	expect(fresh.paths.get(file)).toBeUndefined();
	// unchanged, it holds by its digest, and still waits to settle
	const again = reading(dir);
	expect(witnessHolds(fresh, again.looks, again.pass, since)?.paths.get(file)).toBeUndefined();
	// once the read is far enough past its last change, its stat is taken
	const later = reading(dir);
	expect(witnessHolds(fresh, later.looks, later.pass, since + SETTLED_MS + 1000)?.paths.get(file)).toBeDefined();
	// a same-size rewrite inside the tick: its contents say so
	writeFileSync(file, "export const b = 1;\n");
	const after = reading(dir);
	expect(witnessHolds(fresh, after.looks, after.pass, since)).toBeUndefined();
	// a read that could not tell the file system's time takes none at all
	expect(witnessSource(dir, dir, listed(dir, file), source, undefined, looks, pass.digest)).toBeUndefined();
});

it("takes no witness of a folder holding a link", () => {
	const { dir, file } = oneFile("export default () => null;\n");
	const source = { files: [file], imports: [] };

	const { pass, looks } = reading(dir);
	expect(
		witnessSource(
			dir,
			dir,
			{ ...listed(dir, file), linked: true },
			source,
			Date.now() + 3_600_000,
			looks,
			pass.digest,
		),
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
	const since = Date.now() + 3_600_000;
	const first = reading(dir);
	const witness = witnessSource(dir, dir, listed(dir, file), source, since, first.looks, first.pass.digest);
	if (witness === undefined) throw new Error("expected a witness");
	const unmoved = reading(dir);
	expect(witnessHolds(witness, unmoved.looks, unmoved.pass, since)).toBe(witness);

	writeFileSync(file, "export const b = 1;\n");

	const moved = reading(dir);
	expect(witnessHolds(witness, moved.looks, moved.pass, since)).toBeUndefined();
});

it("holds through a write beside a file it imports, and not through one that moves where the import lands", () => {
	const designDir = realpathSync(makeTempDir());
	const frameDir = join(designDir, "frames", "start");
	mkdirSync(frameDir, { recursive: true });
	mkdirSync(join(designDir, "shared", "row"), { recursive: true });
	writeFileSync(join(designDir, "shared", "row", "index.tsx"), "export const Row = () => null;\n");
	writeFileSync(join(frameDir, "frame.tsx"), `import { Row } from "../../shared/row";\nexport default Row;\n`);
	const settled = new Date(Date.now() - 3_600_000);
	for (const path of [join(designDir, "shared"), join(designDir, "shared", "row")]) utimesSync(path, settled, settled);
	const since = Date.now() + 3_600_000;
	const first = reading(designDir);
	const source = frameSourceIn(first.pass, frameDir);
	const witness = witnessSource(
		designDir,
		frameDir,
		first.pass.listing(frameDir),
		source,
		since,
		first.looks,
		first.pass.digest,
	);
	if (witness === undefined) throw new Error("expected a witness");

	// a file written beside the one the import lands on moves the folder, and nothing the frame reads
	writeFileSync(join(designDir, "shared", "row", "other.tsx"), "export const Other = 1;\n");
	const beside = reading(designDir);
	const retaken = witnessHolds(witness, beside.looks, beside.pass, since);
	expect(retaken).toBeDefined();
	expect(retaken).not.toBe(witness);

	// a file the resolver tries first moves where the import lands
	writeFileSync(join(designDir, "shared", "row.tsx"), "export const Row = () => null;\n");
	const ahead = reading(designDir);
	if (retaken === undefined) throw new Error("expected a witness");
	expect(witnessHolds(retaken, ahead.looks, ahead.pass, since)).toBeUndefined();
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
