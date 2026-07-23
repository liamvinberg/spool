import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { bunExecutor } from "./term-exec";
import { ensureToolchain, toolchainPaths } from "./term-toolchain";

/**
 * The one test that runs the real supervisor under a real bun. CI never
 * downloads the toolchain, so this suite runs only where a bun already
 * exists on PATH (any dev machine) and skips silently elsewhere — the
 * daemon seam itself is covered kind-blind by the fixture executor.
 */

const bunOnPath = spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;

const APP = `process.stdout.write("ready\\n");
process.stdin.on("data", (d) => {
	const s = String(d);
	if (s.includes("q")) process.exit(3);
	if (s.includes("s")) {
		// bun caches process.stdout.columns, so read the kernel's truth
		const r = Bun.spawnSync({ cmd: ["stty", "size"], stdin: "inherit" });
		process.stdout.write("size:" + r.stdout.toString().trim().split(" ").reverse().join("x") + "\\n");
		return;
	}
	process.stdout.write("echo:" + s);
});
setTimeout(() => {}, 60_000);
`;

describe.skipIf(!bunOnPath)("bun executor against the real supervisor", () => {
	it("streams, delivers input, resizes for real, and reports the exit code", { timeout: 20_000 }, async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		// materialize only the supervisor + helpers; bun itself is the machine's
		const paths = toolchainPaths(spoolDir);
		mkdirSync(paths.bunDir, { recursive: true });
		writeFileSync(paths.bunBin, "placeholder — the executor is pointed at the machine's bun\n");
		mkdirSync(paths.packagesModules, { recursive: true });
		writeFileSync(join(paths.packagesDir, ".ready"), "test\n");
		const toolchain = await ensureToolchain(spoolDir, {
			narrate: () => {},
			download: async () => {
				throw new Error("no downloads in tests");
			},
			unzip: async () => {},
			run: async () => {},
		});

		const frameDir = makeTempDir();
		const entry = join(frameDir, "term.tsx");
		writeFileSync(entry, APP);

		const executor = bunExecutor(async () => ({ ...toolchain, bunBin: "bun" }));
		const chunks: Uint8Array[] = [];
		let exitCode: number | undefined;
		const proc = await executor({ frameDir, entry, cols: 40, rows: 10 });
		proc.onData((chunk) => chunks.push(chunk));
		proc.onExit((code) => {
			exitCode = code;
		});

		const text = () => new TextDecoder().decode(Buffer.concat(chunks));
		await until(() => text().includes("ready"));

		proc.write(new TextEncoder().encode("hello\n"));
		await until(() => text().includes("echo:hello"));

		proc.resize(90, 30);
		await new Promise((r) => setTimeout(r, 150));
		proc.write(new TextEncoder().encode("s\n"));
		await until(() => text().includes("size:90x30"));

		proc.write(new TextEncoder().encode("q\n"));
		await until(() => exitCode !== undefined);
		expect(exitCode).toBe(3);
	});
});

async function until(condition: () => boolean, ms = 10_000): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > ms) throw new Error("condition never held");
		await new Promise((r) => setTimeout(r, 40));
	}
}
