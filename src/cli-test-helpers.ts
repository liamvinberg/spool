import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inject } from "vitest";
import { makeTempDir } from "./test-helpers";

export const repoRoot = fileURLToPath(new URL("..", import.meta.url));
export const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");
export const cliPath = join(repoRoot, "src", "cli.ts");

/**
 * Builds the bundle the CLI under test runs from: src/cli.ts and every source file it imports, as one module
 * with packages left to node_modules, each file's import.meta naming its own source path as under tsx. tsx
 * spawns a second node and transpiles some 220 files through off-thread hooks on every call, two seconds and
 * more of each spawn on a loaded machine. The bundle is built from the source as it stands, once per test file.
 */
const bundleScript = `
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [entry, outfile] = process.argv.slice(1);
await build({
	entryPoints: [entry], outfile, bundle: true, platform: "node", format: "esm", target: "node22",
	packages: "external", logLevel: "error",
	plugins: [{ name: "own-import-meta", setup(build) {
		build.onLoad({ filter: /[.]tsx?$/ }, ({ path }) => ({
			loader: path.endsWith("x") ? "tsx" : "ts",
			contents: readFileSync(path, "utf8")
				.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(path).href))
				.replaceAll("import.meta.filename", JSON.stringify(path))
				.replaceAll("import.meta.dirname", JSON.stringify(path.slice(0, path.lastIndexOf("/")))),
		}));
	} }],
});
`;

let runner: [string, string[]] | undefined;

/**
 * How to run the CLI: node, with a loader that serves the bundle in place of src/cli.ts. argv[1] stays
 * src/cli.ts and the loader rides in execArgv, so the CLI still knows it runs from a checkout, and the daemon it
 * starts (execArgv, then its own path) runs from the same bundle. The loader keeps a compile cache beside it.
 */
export function cliCommand(args: string[]): [string, string[]] {
	const [node, cli] = cliRunner();
	return [node, [...cli, ...args]];
}

function cliRunner(): [string, string[]] {
	if (runner !== undefined) return runner;
	const dir = mkdtempSync(join(inject("spoolTestRunDir"), "cli-"));
	const bundle = join(dir, "cli.mjs");
	const built = spawnSync(process.execPath, ["--input-type=module", "-e", bundleScript, cliPath, bundle], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	if (built.status !== 0) throw new Error(`building the cli failed: ${built.stderr}`);
	const loader = join(dir, "loader.mjs");
	writeFileSync(
		loader,
		`import { enableCompileCache, registerHooks } from "node:module";
import { readFileSync } from "node:fs";
enableCompileCache(${JSON.stringify(join(dir, "compile-cache"))});
const cli = ${JSON.stringify(pathToFileURL(cliPath).href)};
registerHooks({
	load: (url, context, next) =>
		url === cli ? { format: "module", source: readFileSync(${JSON.stringify(bundle)}, "utf8"), shortCircuit: true } : next(url, context),
});
`,
	);
	runner = [process.execPath, ["--import", pathToFileURL(loader).href, cliPath]];
	return runner;
}

export function spool(args: string[], home: string, cwd?: string, env: Record<string, string> = {}, timeout?: number) {
	return spawnSync(...cliCommand(args), {
		cwd: cwd ?? repoRoot,
		encoding: "utf8",
		timeout,
		// SPOOL_DIR emptied so a dev shell's dogfood split cannot leak past HOME
		env: { ...process.env, HOME: home, SPOOL_DIR: "", ...env },
	});
}

export function spoolAsync(args: string[], home: string, cwd: string, env: Record<string, string> = {}) {
	return new Promise<{ status: number | null; stdout: string; stderr: string }>((done, fail) => {
		const child = spawn(...cliCommand(args), {
			cwd,
			env: { ...process.env, HOME: home, SPOOL_DIR: "", ...env },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", fail);
		child.on("close", (status) => done({ status, stdout, stderr }));
	});
}

/**
 * A PATH whose platform openers record their arguments instead of opening
 * anything. The real ones would pop a browser on whoever runs the suite, and a
 * test that has to be watched to fail is not a test.
 */
export function fakeOpeners(): { path: string; launched: () => string[] } {
	const dir = makeTempDir();
	const record = join(dir, "launched");
	for (const name of ["open", "xdg-open", "cmd"]) {
		const bin = join(dir, name);
		writeFileSync(bin, `#!/bin/sh\necho "$@" >> ${JSON.stringify(record)}\n`);
		chmodSync(bin, 0o755);
	}
	return {
		path: `${dir}:${process.env.PATH ?? ""}`,
		launched: () => (existsSync(record) ? readFileSync(record, "utf8").split("\n").filter(Boolean) : []),
	};
}
