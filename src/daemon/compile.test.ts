import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../init";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { buildDesignEntry, createFrameCompiler, cssSources, describeCompileError, hashInputs } from "./compile";
import { realDesignDir } from "./design-path";
import { createDesignReads } from "./design-reads";
import { buildPublicationPlayer } from "./play";
import type { Webfonts } from "./webfonts";

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

	// Only where nothing above design/ sets tsconfig compiler options or a
	// package.json `type`: esbuild parses a file under those when a relative
	// import reaches it and not when the shared/ plugin does, as it always has.
	it("compiles to what the same imports by relative path compile to, with no tsconfig or type above design/", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const designDir = realDesignDir(root);
		writeDesignFile(root, "shared/kit/badge.tsx", "export const Badge = () => <b>badge</b>;\n");
		writeDesignFile(root, "shared/kit/copy.ts", 'export const copy = "copy";\n');
		writeDesignFile(root, "shared/kit/folder/index.ts", 'export const folder = "folder";\n');
		writeDesignFile(root, "shared/kit/tokens.css", ".kit { color: red; }\n");
		const frame = (from: string) =>
			[
				`import { Badge } from "${from}kit/badge";`,
				`import { copy } from "${from}kit/copy.ts";`,
				// a folder's index is esbuild's to find, through the same import
				`import { folder } from "${from}kit/folder";`,
				`import "${from}kit/tokens.css";`,
				`import { cn } from "${from}lib/utils";`,
				"export default () => <p className={cn(copy, folder)}><Badge /></p>;",
				"",
			].join("\n");
		const compile = async (from: string) => {
			writeDesignFile(root, join("frames", "shop", "cart", "frame.tsx"), frame(from));
			return await buildDesignEntry({
				designDir,
				resolveDir: join(designDir, "frames", "shop", "cart"),
				sourcefile: "<spool-boot>",
				contents: 'import Frame from "./frame.tsx";\nexport { Frame };\n',
				label: 'frame "cart"',
			});
		};

		const shared = await compile("shared/");
		const relative = await compile("../../../shared/");

		expect(shared.bootJs).toBe(relative.bootJs);
		expect(shared.bundledCss).toBe(relative.bundledCss);
		expect([...shared.sourceFiles].sort()).toEqual([...relative.sourceFiles].sort());
	});
});

/**
 * Frames compile with core's own TypeScript settings. A project's own
 * tsconfig.json above design/, which esbuild would otherwise find and obey,
 * changes nothing a frame compiles to: the cloud is handed design/ alone and
 * must compile the same bytes the canvas does.
 */
describe("a tsconfig.json above design/", () => {
	const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };
	const hostile = JSON.stringify({
		compilerOptions: {
			verbatimModuleSyntax: true,
			experimentalDecorators: true,
			useDefineForClassFields: false,
			jsx: "react",
			jsxFactory: "h",
			baseUrl: ".",
			paths: { "./shape": ["./elsewhere"] },
		},
	});

	async function compiled(root: string): Promise<{ document: string; publication: string }> {
		const doc = await createFrameCompiler("0.0.0-test").getDocument(root, "tsconfig", authority);
		if (doc.kind !== "ok") throw new Error(doc.kind === "error" ? doc.message : doc.message);
		const { bundle } = await buildPublicationPlayer(realDesignDir(root), [{ name: "tsconfig" }], "0.0.0-test");
		return { document: doc.document, publication: [...bundle.chunks.values()].join("\n") };
	}

	it("leaves the frame document and the publication compile unchanged", async () => {
		// the project one folder down, so the folder above it is the test's own
		const outer = makeTempDir();
		mkdirSync(join(outer, "repo"));
		const { root } = initProject(join(outer, "repo"), join(outer, ".spool"));
		writeDesignFile(
			root,
			"frames/tsconfig/shape.ts",
			"export type Shape = { side: number };\nexport const side = 2;\n",
		);
		writeFrame(
			root,
			"tsconfig",
			[
				'import { Shape, side } from "./shape";',
				"function logged(_value: unknown, _context?: unknown) {}",
				"class Square { area = side * side; @logged grow(by: number) { this.area *= by; } }",
				"const shape: Shape = { side };",
				"export default function Frame() { return <p>{new Square().area + shape.side}</p>; }",
				"",
			].join("\n"),
		);
		const before = await compiled(root);

		writeFileSync(join(root, "tsconfig.json"), hostile);
		writeFileSync(join(outer, "tsconfig.json"), hostile);

		expect(await compiled(root)).toEqual(before);
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

/**
 * Every request rehashes a document's inputs, and a frame on a large canvas has
 * a hundred or more: reading them all must not hold the daemon's event loop in
 * one piece.
 */
describe("hashing a document's inputs", () => {
	it("hands the event loop back while it reads them", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const designDir = realDesignDir(root);
		const inputs = Array.from({ length: 500 }, (_, index) => {
			writeDesignFile(root, join("shared", "many", `${index}.ts`), `export const value = ${index};\n`);
			return join(designDir, "shared", "many", `${index}.ts`);
		});
		let handedBack = false;
		setImmediate(() => {
			handedBack = true;
		});

		const hash = await hashInputs("0.0.0-test", "frame", inputs, designDir);

		expect(handedBack).toBe(true);
		expect(hash).toBe(await hashInputs("0.0.0-test", "frame", [...inputs].reverse(), designDir));
	});
});

/**
 * A document keeps the webfont revision its fonts were resolved at (#80), so a
 * machine that comes back online retires it. A hit checks that revision, and
 * hashing the inputs hands the event loop back: a resolve can land meanwhile,
 * and the document it retires must not be served.
 */
describe("the webfont revision a document is built at", () => {
	const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };

	/** A frame with enough inputs that hashing them hands the event loop back. */
	function manyInputs(): string {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const names = Array.from({ length: 400 }, (_, index) => `m${index}`);
		for (const name of names) {
			writeDesignFile(root, join("shared", "many", `${name}.ts`), `export const ${name} = 1;\n`);
		}
		const imports = names.map((name) => `import { ${name} } from "../../shared/many/${name}";`).join("\n");
		writeFrame(root, "fonts", `${imports}\nexport default () => <p>{${names.join(" + ")}}</p>;\n`);
		return root;
	}

	it("is the one its fonts were resolved at, not one a later resolve moved it to", async () => {
		const root = manyInputs();
		let revision = 0;
		let resolved = false;
		const webfonts: Webfonts = {
			// this compile's own resolve moves the revision, as one that reached a
			// face it could not before does
			resolve: async (css) => {
				if (!resolved) revision++;
				resolved = true;
				return css;
			},
			read: async () => undefined,
			revision: () => revision,
		};
		const compiler = createFrameCompiler("0.0.0-test", webfonts);

		const first = await compiler.getDocument(root, "fonts", authority);
		const second = await compiler.getDocument(root, "fonts", authority);
		// a later resolve, another frame's
		revision++;
		const third = await compiler.getDocument(root, "fonts", authority);

		expect(first.kind === "ok" && first.cache).toBe("miss");
		expect(second.kind === "ok" && second.cache).toBe("hit");
		expect(third.kind === "ok" && third.cache).toBe("miss");
	});

	it("names the document's etag, so a browser never keeps fonts a resolve replaced", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		let revision = 0;
		const webfonts: Webfonts = {
			resolve: async (css) => css,
			read: async () => undefined,
			revision: () => revision,
		};
		const compiler = createFrameCompiler("0.0.0-test", webfonts);

		const before = await compiler.getDocument(root, "home", authority);
		revision++;
		const after = await compiler.getDocument(root, "home", authority);

		expect(after.kind === "ok" && after.cache).toBe("miss");
		expect(before.kind === "ok" && after.kind === "ok" && before.etag !== after.etag).toBe(true);
	});

	it("is checked again once a hit has rehashed the inputs", async () => {
		const root = manyInputs();
		let revision = 0;
		const webfonts: Webfonts = {
			resolve: async (css) => css,
			read: async () => undefined,
			revision: () => revision,
		};
		const compiler = createFrameCompiler("0.0.0-test", webfonts);
		const first = await compiler.getDocument(root, "fonts", authority);
		expect(first.kind === "ok" && first.cache).toBe("miss");

		// a resolve elsewhere, landing while the next request rehashes
		setImmediate(() => revision++);
		const second = await compiler.getDocument(root, "fonts", authority);

		expect(revision).toBe(1);
		expect(second.kind === "ok" && second.cache).toBe("miss");
	});
});

/**
 * A document is made of one read of its inputs and cached under the hash of
 * exactly those bytes. The bundle reads the frame's sources first and the
 * webfont resolve comes after, so a resolve that edits the frame stands in for
 * an edit landing mid-compile.
 */
describe("an edit that lands while its frame compiles", () => {
	const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };
	const saying = (words: string) => `export default function Frame() { return <p>${words}</p>; }\n`;
	function editingOnce(root: string, words: string): Webfonts {
		let edited = false;
		return {
			resolve: async (css) => {
				if (!edited) writeFrame(root, "moving", saying(words));
				edited = true;
				return css;
			},
			read: async () => undefined,
			revision: () => 0,
		};
	}

	it("leaves the document of the sources as read, and the next request compiles the edit", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeFrame(root, "moving", saying("before the edit"));
		const compiler = createFrameCompiler("0.0.0-test", editingOnce(root, "after the edit"));

		const first = await compiler.getDocument(root, "moving", authority);
		const second = await compiler.getDocument(root, "moving", authority);
		const third = await compiler.getDocument(root, "moving", authority);

		// the first document is of the sources it read, whole
		expect(first.kind === "ok" && first.document).toContain("before the edit");
		expect(first.kind === "ok" && first.document).not.toContain("after the edit");
		// and never stands in for the edit
		expect(second.kind === "ok" && second.cache).toBe("miss");
		expect(second.kind === "ok" && second.document).toContain("after the edit");
		expect(third.kind === "ok" && third.cache).toBe("hit");
	});
});

describe("a project folder where a file is expected", () => {
	it("is no input at all, the way an absent file is", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		for (const name of ["fonts.css", "importmap.json", "transitions.css"]) {
			rmSync(join(root, "design", "shared", name), { force: true });
			mkdirSync(join(root, "design", "shared", name));
		}
		const compiler = createFrameCompiler("0.0.0-test");
		const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };

		const first = await compiler.getDocument(root, "home", authority);
		const second = await compiler.getDocument(root, "home", authority);

		expect(first.kind === "error" ? first.message : first.kind).toBe("ok");
		expect(second.kind === "ok" && second.cache).toBe("hit");
	});
});

/**
 * Two requests for one frame can miss together. Each answers for the entry it
 * found: a miss that fails must not clear what another miss cached meanwhile.
 */
describe("misses that overlap", () => {
	it("keep the document one cached when the other fails", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		let calls = 0;
		let release = () => {};
		const held = new Promise<void>((done) => {
			release = done;
		});
		const webfonts: Webfonts = {
			// the first compile is held at its fonts until the second has cached,
			// and then fails
			resolve: async (css) => {
				calls++;
				if (calls === 1) {
					await held;
					throw new Error("the network went away");
				}
				return css;
			},
			read: async () => undefined,
			revision: () => 0,
		};
		const compiler = createFrameCompiler("0.0.0-test", webfonts);
		const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };

		const failing = compiler.getDocument(root, "home", authority);
		while (calls === 0) await new Promise((done) => setImmediate(done));
		const cached = await compiler.getDocument(root, "home", authority);
		release();

		expect(cached.kind === "ok" && cached.cache).toBe("miss");
		expect((await failing).kind).toBe("error");
		const after = await compiler.getDocument(root, "home", authority);
		expect(after.kind === "ok" && after.cache).toBe("hit");
	});
});

/**
 * A compile hands esbuild the bytes it read rather than letting esbuild read
 * each file, and esbuild gives an import's attributes their meaning only for a
 * file it reads itself. Whatever an import asks, the bundle must be the one
 * esbuild makes on its own.
 */
describe("a bundle made of the compile's own reads", () => {
	it.each([
		'import text from "./note.js" with { type: "text" };\nexport default text;',
		'import bytes from "./note.js" with { type: "bytes" };\nexport default bytes;',
		'import { k } from "./data.json" with { type: "json" };\nexport default k;',
		'import data from "./data.json" with { type: "json" };\nexport default data;',
		'import sheet from "./look.css" with { type: "css" };\nexport default sheet;',
		'export { a } from "./plain.ts";',
	])("is the bundle esbuild makes reading for itself: %s", async (contents) => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeDesignFile(root, "note.js", "export const secret = 1;\n");
		writeDesignFile(root, "data.json", '{"k": 1}\n');
		writeDesignFile(root, "look.css", ".look { color: red }\n");
		writeDesignFile(root, "plain.ts", "export const a: number = 1;\n");
		const designDir = realDesignDir(root);
		const entry = { designDir, resolveDir: designDir, sourcefile: "<spool-boot>", contents, label: "the entry" };
		const outcome = (built: Promise<{ bootJs: string; bundledCss?: string | undefined }>) =>
			built.then(
				({ bootJs, bundledCss }) => ({ bootJs, bundledCss }),
				(error: unknown) => describeCompileError(error),
			);
		const reads = createDesignReads(designDir);

		const own = await outcome(buildDesignEntry(entry));
		const handed = await outcome(buildDesignEntry({ ...entry, reads: () => reads }));

		expect(handed).toEqual(own);
		expect(reads.settled()).toBe(true);
	});

	it("hands the stylesheet worker each file in a buffer of its own, never a shared slab", () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const designDir = realDesignDir(root);
		const files = ["a", "b", "c"].map((name) => {
			writeDesignFile(root, `${name}.ts`, `export const ${name} = 1;\n`);
			return join(designDir, `${name}.ts`);
		});

		const sources = cssSources(createDesignReads(designDir), files);

		expect(sources.map(({ bytes }) => bytes.buffer.byteLength)).toEqual(sources.map(({ bytes }) => bytes.byteLength));
		expect(sources.map(({ bytes }) => Buffer.from(bytes).toString("utf8"))).toEqual([
			"export const a = 1;\n",
			"export const b = 1;\n",
			"export const c = 1;\n",
		]);
	});

	it("checks a file that read as absent but that esbuild then read for itself", () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const designDir = realDesignDir(root);
		const file = join(designDir, "late.ts");
		const reads = createDesignReads(designDir);

		reads.readTwice(file);
		writeDesignFile(root, "late.ts", "export const late = 1;\n");

		expect(reads.settled()).toBe(false);
	});
});
