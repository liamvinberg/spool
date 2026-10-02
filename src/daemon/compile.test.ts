import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { buildDesignEntry, createFrameCompiler } from "./compile";
import { realDesignDir } from "./design-path";

describe.each(["glsl", "wgsl"])(".%s source imports", (extension) => {
	it.each(["./effect", "shared/shaders/effect"])("imports %s as the complete source string", async (specifier) => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const relativeFile = `${specifier.replace(/^\.\//, "")}.${extension}`;
		const source = '// source stays text: "quoted", \\paths, λ\nvoid main() {}\n';
		writeDesignFile(root, relativeFile, source);
		const designDir = realDesignDir(root);
		const { bootJs, sourceFiles } = await buildDesignEntry({
			designDir,
			resolveDir: designDir,
			sourcefile: "<spool-boot>",
			contents: `export { default as source } from "${specifier}.${extension}";`,
			label: "shader source",
		});

		const bundled = await import(`data:text/javascript;base64,${Buffer.from(bootJs).toString("base64")}`);
		expect(bundled.source).toBe(source);
		expect(sourceFiles).toContain(join(designDir, relativeFile));
	});

	it("keeps the file itself in the closure when the import carries ?raw", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeDesignFile(root, `effect.${extension}`, "void main() {}\n");
		const designDir = realDesignDir(root);
		const { sourceFiles } = await buildDesignEntry({
			designDir,
			resolveDir: designDir,
			sourcefile: "<spool-boot>",
			contents: `export { default as source } from "./effect.${extension}?raw";`,
			label: "shader source",
		});
		expect(sourceFiles).toEqual([join(designDir, `effect.${extension}`)]);
	});

	it.each(["relative", "symlink"])("rejects a %s import outside design/", async (kind) => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const designDir = realDesignDir(root);
		const outside = join(root, `outside.${extension}`);
		writeFileSync(outside, "private shader source");
		if (kind === "symlink") symlinkSync(outside, join(designDir, `outside.${extension}`));
		await expect(
			buildDesignEntry({
				designDir,
				resolveDir: designDir,
				sourcefile: "<spool-boot>",
				contents: `export { default } from "${kind === "relative" ? ".." : "."}/outside.${extension}";`,
				label: "shader source",
			}),
		).rejects.toThrow("design boundary");
	});
});

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

/**
 * The photo booth compiles every frame of every registered project, and lets
 * go of one nobody has open once it is photographed. Forgetting is per frame,
 * whatever authority the document was built for, and costs the next request a
 * compile and nothing else.
 */
describe("forgetting a compiled document", () => {
	it("compiles the frame afresh and leaves every other frame cached", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		writeFrame(root, "homepage", "export default function Page() { return <main>page</main>; }\n");
		const compiler = createFrameCompiler("0.0.0-test");
		const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };
		const other = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:2" };
		const cache = async (frame: string, by = authority) => {
			const doc = await compiler.getDocument(root, frame, by);
			return doc.kind === "ok" ? doc.cache : doc.kind;
		};
		expect(await cache("home")).toBe("miss");
		expect(await cache("home", other)).toBe("miss");
		expect(await cache("homepage")).toBe("miss");

		compiler.forget(root, "home");

		expect(await cache("home")).toBe("miss");
		expect(await cache("home", other)).toBe("miss");
		// a name that merely starts with the forgotten one is another frame
		expect(await cache("homepage")).toBe("hit");
	});
});
