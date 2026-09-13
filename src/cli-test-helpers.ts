import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTempDir } from "./test-helpers";

export const repoRoot = fileURLToPath(new URL("..", import.meta.url));
export const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");
export const cliPath = join(repoRoot, "src", "cli.ts");

export function spool(args: string[], home: string, cwd?: string, env: Record<string, string> = {}, timeout?: number) {
	return spawnSync(tsxBin, [cliPath, ...args], {
		cwd: cwd ?? repoRoot,
		encoding: "utf8",
		timeout,
		// SPOOL_DIR emptied so a dev shell's dogfood split cannot leak past HOME
		env: { ...process.env, HOME: home, SPOOL_DIR: "", ...env },
	});
}

export function spoolAsync(args: string[], home: string, cwd: string, env: Record<string, string> = {}) {
	return new Promise<{ status: number | null; stdout: string; stderr: string }>((done, fail) => {
		const child = spawn(tsxBin, [cliPath, ...args], {
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
