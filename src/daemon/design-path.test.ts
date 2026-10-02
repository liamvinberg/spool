import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { DesignBoundaryError, designPathResolver, realDesignDir, resolveDesignPath } from "./design-path";

function attempt(resolvePath: () => string): string {
	try {
		return resolvePath();
	} catch (error) {
		if (!(error instanceof DesignBoundaryError)) throw error;
		return `refused: ${error.message}`;
	}
}

/**
 * One resolver answers for every path of a pass, canonicalizing each folder
 * once, and must answer exactly as a resolveDesignPath per path does: the same
 * canonical path, the same refusal.
 */
describe("a design path resolver", () => {
	it("answers every path as resolveDesignPath does", () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const designDir = realDesignDir(root);
		const outside = join(makeTempDir(), "outside");
		mkdirSync(outside);
		writeFileSync(join(outside, "secret.ts"), "export const secret = 1;\n");
		writeDesignFile(root, "shared/real/a.ts", "export const a = 1;\n");
		writeDesignFile(root, "shared/real/b.ts", "export const b = 1;\n");
		symlinkSync(join(designDir, "shared", "real"), join(designDir, "shared", "linked"), "dir");
		symlinkSync(join(designDir, "shared", "real", "a.ts"), join(designDir, "shared", "a-link.ts"));
		symlinkSync(outside, join(designDir, "shared", "away"), "dir");
		symlinkSync(join(outside, "secret.ts"), join(designDir, "shared", "secret.ts"));
		symlinkSync(join(designDir, "shared", "gone.ts"), join(designDir, "shared", "dangling.ts"));
		const paths = [
			"shared/real/a.ts",
			"shared/real/b.ts",
			"shared/linked/a.ts",
			"shared/linked/b.ts",
			"shared/a-link.ts",
			"shared/new/folder/file.ts",
			"shared/linked/new.ts",
			"shared/away/secret.ts",
			"shared/secret.ts",
			"shared/dangling.ts",
			"../outside.ts",
		].map((path) => join(designDir, path));

		const resolvePath = designPathResolver(designDir);
		const together = paths.map((path) => attempt(() => resolvePath(path)));
		const apart = paths.map((path) => attempt(() => resolveDesignPath(designDir, path)));

		expect(together).toEqual(apart);
		expect(together.filter((answer) => answer.startsWith("refused"))).toHaveLength(4);
		expect(together[2]).toBe(join(designDir, "shared", "real", "a.ts"));
	});

	it("sees a folder swapped for an outside link in the next pass", () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const designDir = realDesignDir(root);
		writeDesignFile(root, "shared/kit/a.ts", "export const a = 1;\n");
		const outside = join(makeTempDir(), "kit");
		mkdirSync(outside);
		writeFileSync(join(outside, "a.ts"), "export const a = 2;\n");
		const file = join(designDir, "shared", "kit", "a.ts");
		expect(designPathResolver(designDir)(file)).toBe(file);

		rmSync(join(designDir, "shared", "kit"), { recursive: true });
		symlinkSync(outside, join(designDir, "shared", "kit"), "dir");

		expect(() => designPathResolver(designDir)(file)).toThrow(DesignBoundaryError);
	});
});
