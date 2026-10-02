import type * as fs from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createFlowGraph } from "./flows";

/**
 * The belt under the witness (#109): a stat is not the proof a frame's bytes
 * are, so every frame is proven by its bytes at least once a minute whatever
 * its witness says. Here a stat really does lie, the one thing no write on a
 * real disk can make it do, and the edit it hid still lands within the minute.
 */

/** Paths whose stat answers what it said when frozen, whatever happens to them. */
const frozen = new Map<string, fs.BigIntStats>();

vi.mock("node:fs", async (importOriginal) => {
	const real = await importOriginal<typeof fs>();
	const statSync = ((path: fs.PathLike, options?: fs.StatSyncOptions) =>
		frozen.get(String(path)) ?? real.statSync(path, options)) as typeof real.statSync;
	return { ...real, default: { ...real, statSync }, statSync };
});

afterEach(() => {
	frozen.clear();
	vi.restoreAllMocks();
});

const goTsx = (target: string) => `export default () => <a data-go="${target}">go</a>;\n`;

it("proves every frame by its bytes once a minute, whatever its witness says", async () => {
	const real = await vi.importActual<typeof fs>("node:fs");
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeFrame(root, "cart", goTsx("one"));
	writeFrame(root, "one", "export default () => null;\n");
	writeFrame(root, "two", "export default () => null;\n");
	let now = 1_000_000;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const graph = createFlowGraph({ clock: () => Date.now() + 3_600_000 });
	const edges = async () => (await graph.flows(root)).edges.map((edge) => `${edge.from} -> ${edge.to}`);
	expect(await edges()).toEqual(["cart -> one"]);

	// the frame's own file changes, and its stat says it did not
	const file = real.realpathSync(join(root, "design", "frames", "cart", "frame.tsx"));
	frozen.set(file, real.statSync(file, { bigint: true }));
	writeFrame(root, "cart", goTsx("two"));
	now += 1_000;
	expect(await edges()).toEqual(["cart -> one"]);

	now += 60_000;
	expect(await edges()).toEqual(["cart -> two"]);
});
