import { describe, expect, it } from "vitest";
import { copyFingerprint, LIST_PAGE, readDrift, readListed } from "./team-sync-protocol";

/**
 * The checks every connect makes (#204), as the daemon and spool.page's sync object both compute them. The literal
 * vector below is the same one spool-cloud's mirror is tested against, so the two can't drift apart unseen.
 */

/** The known-good vector: four paths, one of them deleted, out of order. */
const VECTOR = [
	{ path: "frames/home/frame.tsx", hash: "9a3e246041d3c27dc3645f79cb0d1eb41c277965614655d17119ed7498b956ec" },
	{ path: "canvas.json", hash: "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356" },
	{ path: "frames/about/frame.tsx", hash: null },
	{ path: "shared/tokens.css", hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
];
const VECTOR_FINGERPRINT = "071e82b9b3a6fb2ab2224f234bf6e3c69933b2c24acb15aff1eda9dbbf5c9054";

describe("a copy's fingerprint", () => {
	it("is the known-good vector's, whatever order the paths come in, deletes left out", async () => {
		expect(await copyFingerprint(VECTOR)).toBe(VECTOR_FINGERPRINT);
		expect(await copyFingerprint([...VECTOR].reverse())).toBe(VECTOR_FINGERPRINT);
		expect(await copyFingerprint(VECTOR.filter(({ hash }) => hash !== null))).toBe(VECTOR_FINGERPRINT);
	});

	it("changes with any path's bytes or name, and an empty copy has one too", async () => {
		const [home, ...rest] = VECTOR;
		if (home === undefined) throw new Error("no vector");
		expect(await copyFingerprint([{ ...home, hash: "0".repeat(64) }, ...rest])).not.toBe(VECTOR_FINGERPRINT);
		expect(await copyFingerprint([{ ...home, path: "frames/home2/frame.tsx" }, ...rest])).not.toBe(
			VECTOR_FINGERPRINT,
		);
		expect(await copyFingerprint([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	});
});

describe("what a check says", () => {
	it("reads a listed page field by field, and nothing malformed or past a page", () => {
		const page = {
			type: "listed",
			files: [{ path: "canvas.json", version: 3, hash: "ab", extra: 1 }],
			next: null,
			head: 3,
		};
		expect(readListed(page)).toEqual({
			type: "listed",
			files: [{ path: "canvas.json", version: 3, hash: "ab" }],
			next: null,
			head: 3,
		});
		expect(readListed({ ...page, files: [{ path: "canvas.json", version: 3, hash: null }] })).toBeUndefined();
		expect(readListed({ ...page, next: 4 })).toBeUndefined();
		const full = Array.from({ length: LIST_PAGE + 1 }, (_, at) => ({
			path: `frames/${at}/frame.tsx`,
			version: 1,
			hash: "ab",
		}));
		expect(readListed({ ...page, files: full })).toBeUndefined();
	});

	it("reads a drift's counts and cause, never anything more", () => {
		expect(readDrift({ type: "drift", repaired: 2, cause: "missed", paths: ["x"] })).toEqual({
			type: "drift",
			repaired: 2,
			cause: "missed",
		});
		expect(readDrift({ type: "drift", repaired: 2, cause: "restored" })).toBeUndefined();
		expect(readDrift({ type: "drift", repaired: -1, cause: "missed" })).toBeUndefined();
	});
});
