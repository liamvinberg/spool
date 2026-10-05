import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { DesignBoundaryError, realDesignDir } from "./design-path";
import { contentDigest, createDesignReads } from "./design-reads";
import { diskDesignFiles } from "./disk-files";

function project() {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	return { root, designDir: realDesignDir(root) };
}

/**
 * A compile's reads are what its document is made of and what its cache key
 * hashes, so each file is read once, whoever asks and whenever.
 */
describe("a compile's reads", () => {
	it("give every ask the bytes of the first read, and hash exactly those", () => {
		const { root, designDir } = project();
		writeDesignFile(root, "shared/a.ts", "export const a = 1;\n");
		const file = join(designDir, "shared", "a.ts");
		const reads = createDesignReads(designDir, diskDesignFiles);

		const first = reads.bytes(file);
		writeDesignFile(root, "shared/a.ts", "export const a = 2;\n");

		expect(reads.text(file)).toBe("export const a = 1;\n");
		expect(reads.bytes(file)).toBe(first);
		expect(reads.digests().get(file)).toBe(contentDigest(Buffer.from("export const a = 1;\n")));
		expect(reads.settled()).toBe(true);
	});

	it("read nothing, and no failure, where a folder or nothing stands in for a file", () => {
		const { designDir } = project();
		rmSync(join(designDir, "shared", "fonts.css"), { force: true });
		mkdirSync(join(designDir, "shared", "fonts.css"));
		const reads = createDesignReads(designDir, diskDesignFiles);

		expect(reads.text(join(designDir, "shared", "fonts.css"))).toBeUndefined();
		expect(reads.text(join(designDir, "shared", "missing.json"))).toBeUndefined();
		expect([...reads.digests().values()]).toEqual(["absent", "absent"]);
	});

	it("refuse a file outside design/ rather than read it", () => {
		const { root, designDir } = project();
		const outside = join(root, "outside.ts");
		writeFileSync(outside, "export const secret = 1;\n");
		symlinkSync(outside, join(designDir, "shared", "escape.ts"));
		const reads = createDesignReads(designDir, diskDesignFiles);

		expect(() => reads.bytes(join(designDir, "shared", "escape.ts"))).toThrow(DesignBoundaryError);
		expect(reads.digests().size).toBe(0);
	});

	it("are of no one state once a file read elsewhere was read two ways", () => {
		const { designDir } = project();
		const tokens = join(designDir, "shared", "tokens.css");
		const reads = createDesignReads(designDir, diskDesignFiles);

		reads.noted(tokens, contentDigest(Buffer.from("a")));
		reads.noted(tokens, contentDigest(Buffer.from("a")));
		expect(reads.settled()).toBe(true);
		reads.noted(tokens, contentDigest(Buffer.from("b")));
		expect(reads.settled()).toBe(false);
	});
});
