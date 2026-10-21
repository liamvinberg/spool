import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { historyCache } from "./history-cache";

/**
 * The machine's cache of what the team history read (spool#189): bytes kept by key under the spool state dir,
 * outside every local copy, read back by a later daemon, and never more than its size in all, the least recently
 * used going first.
 */

const bytes = (size: number, fill = 1) => new Uint8Array(size).fill(fill);

/** Every byte the cache holds on disk. */
function onDisk(dir: string): number {
	let total = 0;
	if (!existsSync(dir)) return 0;
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true }))
		if (entry.isFile()) total += statSync(join(entry.parentPath, entry.name)).size;
	return total;
}

it("keeps what it is given for a later daemon to read back", () => {
	const dir = join(makeTempDir(), "history-cache");
	historyCache(dir, { maxBytes: 1000 }).write("blobs/abc", bytes(10, 7));
	expect(historyCache(dir, { maxBytes: 1000 }).read("blobs/abc")).toEqual(bytes(10, 7));
	expect(historyCache(dir, { maxBytes: 1000 }).read("blobs/none")).toBeUndefined();
});

it("holds no more than its size, letting the least recently used go first", () => {
	const dir = join(makeTempDir(), "history-cache");
	const cache = historyCache(dir, { maxBytes: 250 });
	cache.write("blobs/a", bytes(100));
	cache.write("blobs/b", bytes(100));
	// a is used again, so b is the one that goes
	expect(cache.read("blobs/a")).toBeDefined();
	cache.write("moments/c.json", bytes(100));
	expect(cache.read("blobs/b")).toBeUndefined();
	expect(cache.read("blobs/a")).toBeDefined();
	expect(cache.read("moments/c.json")).toBeDefined();
	expect(onDisk(dir)).toBeLessThanOrEqual(250);
});

it("remembers what was used last across daemons", () => {
	const dir = join(makeTempDir(), "history-cache");
	const first = historyCache(dir, { maxBytes: 250 });
	first.write("blobs/a", bytes(100));
	first.write("blobs/b", bytes(100));
	first.read("blobs/a");
	const later = historyCache(dir, { maxBytes: 250 });
	later.write("blobs/c", bytes(100));
	expect(later.read("blobs/b")).toBeUndefined();
	expect(later.read("blobs/a")).toBeDefined();
});

it("keeps nothing bigger than its whole size", () => {
	const dir = join(makeTempDir(), "history-cache");
	const cache = historyCache(dir, { maxBytes: 50 });
	cache.write("blobs/big", bytes(100));
	expect(cache.read("blobs/big")).toBeUndefined();
	expect(onDisk(dir)).toBe(0);
});
