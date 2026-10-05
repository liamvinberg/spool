import { cpSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import * as wasm from "esbuild-wasm";
import { describe, expect, it } from "vitest";
import {
	type CompileHost,
	compileFrameDocument,
	compilePublication,
	ESBUILD_VERSION,
	inProcessStylesheets,
	memoryDesignFiles,
	scanCandidates,
	TAILWIND_STYLESHEETS,
} from "./compile-entry";
import { createFrameCompiler } from "./daemon/compile";
import { realDesignDir } from "./daemon/design-path";
import { buildPublicationPlayer } from "./daemon/play";
import { makeTempDir } from "./test-helpers";

/**
 * Spool Cloud compiles with core's own compile, imported from the published
 * package, in a Worker: esbuild-wasm, the project's files in memory, and
 * stylesheets made in place. What it compiles must be byte for byte what the
 * daemon compiles from the same files, or a frame that plays on the canvas
 * would play otherwise in the cloud.
 */

const fixture = fileURLToPath(new URL("../fixtures/compile/design", import.meta.url));
const VERSION = "0.0.0-test";
const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };
const FRAMES = [{ name: "home" }, { name: "shop/cart", page: "shop" }];

function walk(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

/** The fixture as the daemon finds it: a project on disk. */
function onDisk(): { root: string; designDir: string } {
	const root = join(makeTempDir(), "fixture-project");
	cpSync(fixture, join(root, "design"), { recursive: true });
	return { root, designDir: realDesignDir(root) };
}

/** The fixture as a Worker holds it: in memory, under a folder no disk has. */
function inMemory(): { host: CompileHost; designDir: string } {
	const designDir = "/held/in/memory/design";
	const files = memoryDesignFiles(
		walk(fixture).map((file) => [join(designDir, relative(fixture, file)), readFileSync(file)] as const),
	);
	const tailwindDir = join(createRequire(import.meta.url).resolve("tailwindcss/index.css"), "..");
	const tailwind = new Map(TAILWIND_STYLESHEETS.map((name) => [name, readFileSync(join(tailwindDir, name), "utf8")]));
	const stylesheets = inProcessStylesheets({ files, tailwind: (name) => tailwind.get(name), scan: scanCandidates });
	return { host: { esbuild: wasm, files, stylesheets }, designDir };
}

describe("the compile entry, with the files in memory and esbuild-wasm", () => {
	it("runs the esbuild the daemon runs", () => {
		expect([esbuild.version, wasm.version]).toEqual([ESBUILD_VERSION, ESBUILD_VERSION]);
	});

	it.each(FRAMES.map((ref) => ref.name))(
		"compiles the frame document for %s byte for byte as the daemon does",
		{
			timeout: 60_000,
		},
		async (frame) => {
			const { root } = onDisk();
			const { host, designDir } = inMemory();

			const daemon = await createFrameCompiler(VERSION).getDocument(root, frame, authority);
			const cloud = await compileFrameDocument(host, {
				designDir,
				frame,
				project: basename(root),
				authority,
				version: VERSION,
			});

			if (daemon.kind !== "ok") throw new Error(daemon.message);
			expect(cloud.document).toBe(daemon.document);
			// the etag is made of the input hash: the same inputs hash the same
			expect(cloud.etag).toBe(daemon.etag);
			expect(cloud.settled).toBe(true);
		},
	);

	it("names one version of a frame the same for every machine and the cloud", { timeout: 60_000 }, async () => {
		const { root } = onDisk();
		const { host, designDir } = inMemory();
		const elsewhere = { projectCapability: "another-machine", controlOrigin: "https://spool.page" };

		const daemon = await createFrameCompiler(VERSION).getDocument(root, "home", authority);
		const cloud = await compileFrameDocument(host, {
			designDir,
			frame: "home",
			project: basename(root),
			authority: elsewhere,
			version: VERSION,
		});

		if (daemon.kind !== "ok") throw new Error(daemon.message);
		// compiled for someone else, so another document: but the same version of home
		expect(cloud.etag).not.toBe(daemon.etag);
		expect(cloud.source).toBe(daemon.source);
		const cart = await compileFrameDocument(host, {
			designDir,
			frame: "shop/cart",
			project: basename(root),
			authority: elsewhere,
			version: VERSION,
		});
		expect(cart.source).not.toBe(cloud.source);
	});

	it("compiles the publication byte for byte as the daemon does", { timeout: 60_000 }, async () => {
		const disk = onDisk();
		const memory = inMemory();

		const daemon = await buildPublicationPlayer(disk.designDir, FRAMES, VERSION);
		const cloud = await compilePublication(memory.host, {
			designDir: memory.designDir,
			frames: FRAMES,
			version: VERSION,
		});

		expect({ ...cloud.bundle, chunks: [...cloud.bundle.chunks] }).toEqual({
			...daemon.bundle,
			chunks: [...daemon.bundle.chunks],
		});
		expect(cloud.inputs.map((file) => relative(memory.designDir, file)).sort()).toEqual(
			daemon.inputs.map((file) => relative(disk.designDir, file)).sort(),
		);
	});
});

/**
 * A Worker starts by evaluating its whole script, under a CPU limit, and has
 * no file system or `import.meta` to speak of. Importing the compile entry
 * must call nothing in anything it imports.
 */
describe("importing the compile entry", () => {
	it("calls nothing it imports, and reads nothing", { timeout: 30_000 }, async () => {
		const calls: string[] = [];
		(globalThis as { __spoolEntryCalls?: string[] }).__spoolEntryCalls = calls;
		const imported = new Set<string>();
		const result = await esbuild.build({
			entryPoints: [fileURLToPath(new URL("./compile-entry.ts", import.meta.url))],
			bundle: true,
			format: "esm",
			platform: "neutral",
			write: false,
			logLevel: "silent",
			plugins: [
				{
					name: "recorded",
					setup(build) {
						// every module the entry imports from outside itself, wrapped to say when it is called
						build.onResolve({ filter: /^[^./]/ }, (args) =>
							args.namespace === "recorded"
								? { path: args.path, external: true }
								: { path: args.path, namespace: "recorded" },
						);
						build.onLoad({ filter: /.*/, namespace: "recorded" }, async (args) => {
							imported.add(args.path);
							const real = (await import(args.path)) as Record<string, unknown>;
							const names = Object.keys(real).filter(
								(name) => name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name),
							);
							const lines = names.map((name) =>
								typeof real[name] === "function"
									? `export const ${name} = (...args) => (globalThis.__spoolEntryCalls.push(${JSON.stringify(`${args.path} ${name}`)}), real.${name}(...args));`
									: `export const ${name} = real.${name};`,
							);
							return {
								contents: `import * as real from ${JSON.stringify(args.path)};\n${lines.join("\n")}\n`,
								loader: "js",
							};
						});
					},
				},
			],
		});
		const bundle = result.outputFiles[0]?.text ?? "";
		const file = join(makeTempDir(), "compile-entry.mjs");
		writeFileSync(file, bundle);

		const entry = (await import(pathToFileURL(file).href)) as Record<string, unknown>;

		expect(calls).toEqual([]);
		expect(typeof entry.compileFrameDocument).toBe("function");
		expect(bundle).not.toContain("import.meta");
		// the file system, the module loader and threads are the daemon's, never the compile's
		expect([...imported].sort()).toEqual(["node:buffer", "node:crypto", "node:path", "tailwindcss"]);
	});
});
