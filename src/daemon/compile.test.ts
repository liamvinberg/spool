import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { buildDesignEntry } from "./compile";
import { realDesignDir } from "./design-path";

/**
 * The bundle closure a document is cached against. The virtual boot entry is
 * esbuild's, not the project's — it must never reach the closure, because
 * nothing on disk answers to it and a file that cannot be read hashes as a
 * constant rather than as itself (#124).
 */
describe("the compiled closure", () => {
	it("keeps the boot entry out, for a frame resolved from inside a page", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "shop", "cart", "frame.tsx"), "export default () => null;\n");
		const designDir = realDesignDir(root);

		const { sourceFiles } = await buildDesignEntry({
			designDir,
			// what a frame passes: esbuild keys the entry against this, not against designDir
			resolveDir: join(designDir, "frames", "shop", "cart"),
			sourcefile: "<spool-boot>",
			contents: 'import Frame from "./frame.tsx";\nexport { Frame };\n',
			label: 'frame "cart"',
		});

		expect(sourceFiles.some((file) => file.includes("<spool-boot>"))).toBe(false);
		expect(sourceFiles).toEqual([join(designDir, "frames", "shop", "cart", "frame.tsx")]);
	});

	it("keeps the boot entry out when the entry resolves from the design root", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "cart", "frame.tsx"), "export default () => null;\n");
		const designDir = realDesignDir(root);

		const { sourceFiles } = await buildDesignEntry({
			designDir,
			// what the player composition passes (`play.ts`)
			resolveDir: designDir,
			sourcefile: "<spool-boot>",
			contents: 'import Frame from "./frames/cart/frame.tsx";\nexport { Frame };\n',
			label: "the player",
		});

		expect(sourceFiles.some((file) => file.includes("<spool-boot>"))).toBe(false);
		expect(sourceFiles).toEqual([join(designDir, "frames", "cart", "frame.tsx")]);
	});
});

/**
 * The design-relative shared/ form (#273): `import ... from "shared/lib/utils"`
 * resolves against design/ from any importer at any depth, so a folder move
 * never breaks the import. The prefix must be claimed before
 * `packages: "external"` sends it to the import map, where nothing answers it.
 */
describe("design-relative shared/ imports", () => {
	it("resolves shared/ against design/ from inside a page", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		writeDesignFile(
			root,
			join("frames", "shop", "cart", "frame.tsx"),
			'import { cn } from "shared/lib/utils";\nexport default () => cn("cart");\n',
		);
		const designDir = realDesignDir(root);

		const { sourceFiles } = await buildDesignEntry({
			designDir,
			resolveDir: join(designDir, "frames", "shop", "cart"),
			sourcefile: "<spool-boot>",
			contents: 'import Frame from "./frame.tsx";\nexport { Frame };\n',
			label: 'frame "cart"',
		});

		// the scaffold's own cn(), reached without a single ../
		expect(sourceFiles).toContain(join(designDir, "shared", "lib", "utils.ts"));
	});
});
