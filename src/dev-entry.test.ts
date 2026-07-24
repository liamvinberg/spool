import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { daemonUrl, readDaemonState, stopDaemon } from "./daemon/lifecycle";
import { makeTempDir } from "./test-helpers";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const children: ChildProcess[] = [];
const daemonSpoolDirs: string[] = [];

afterEach(async () => {
	for (const spoolDir of daemonSpoolDirs.splice(0)) await stopDaemon(spoolDir);
	for (const child of children.splice(0)) {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
			await exits(child);
		}
	}
});

describe("checkout development entry", () => {
	it("serves rebuilt UI assets and stands down without leaving another watcher", { timeout: 60_000 }, async () => {
		const checkout = copyCheckout();
		const spoolDir = join(makeTempDir(), ".spool");
		const home = makeTempDir();
		daemonSpoolDirs.push(spoolDir);
		const first = startCheckout(checkout, spoolDir, home, "0", false);
		children.push(first.child);
		const handoff = await exits(first.child);
		expect(handoff.code).toBe(0);
		expect(handoff.signal).toBeNull();

		const state = await until(() => readDaemonState(spoolDir));
		const url = daemonUrl(state.host, state.port);
		const firstAsset = await servedAsset(url);
		expect(firstAsset).toContain("createRoot");

		const main = join(checkout, "src", "ui", "main.tsx");
		const original = readFileSync(main, "utf8");
		writeFileSync(main, `${original}\nconsole.info("spool dev rebuild marker");\n`);
		const rebuilt = await until(async () => {
			try {
				const asset = await servedAsset(url);
				return asset.includes("spool dev rebuild marker") ? asset : undefined;
			} catch {
				return undefined;
			}
		});
		expect(rebuilt).toContain("spool dev rebuild marker");

		const second = startCheckout(checkout, spoolDir, home, String(state.port));
		children.push(second.child);
		const outcome = await exits(second.child);
		expect(outcome.code).toBe(0);
		expect(outcome.signal).toBeNull();
		expect(outcome.stdout).toContain("standing down");
	});
});

function copyCheckout(): string {
	const checkout = makeTempDir();
	cpSync(join(repoRoot, "src"), join(checkout, "src"), { recursive: true });
	for (const file of ["package.json", "vite.config.ts", "tsconfig.json", "tsconfig.ui.json"]) {
		cpSync(join(repoRoot, file), join(checkout, file));
	}
	mkdirSync(checkout, { recursive: true });
	symlinkSync(join(repoRoot, "node_modules"), join(checkout, "node_modules"));
	return checkout;
}

function startCheckout(
	checkout: string,
	spoolDir: string,
	home: string,
	port: string,
	foreground = true,
): { child: ChildProcess } {
	const args = [join(checkout, "src", "dev.ts"), "serve", ...(foreground ? ["--foreground"] : [])];
	const child = spawn(join(checkout, "node_modules", ".bin", "tsx"), args, {
		cwd: checkout,
		env: { ...process.env, HOME: home, SPOOL_DIR: spoolDir, SPOOL_PORT: port },
	});
	let stdout = "";
	child.stdout?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		stdout += chunk;
	});
	return { child: Object.assign(child, { spoolDevStdout: () => stdout }) };
}

async function servedAsset(url: string): Promise<string> {
	const html = await (await fetch(url)).text();
	const path = html.match(/src="(\/ui\/assets\/[^"?]+\.js)"/)?.[1];
	if (path === undefined) throw new Error("canvas HTML did not name a JavaScript asset");
	return (await fetch(new URL(path, url))).text();
}

async function until<T>(probe: () => T | Promise<T | undefined> | undefined): Promise<T> {
	for (let attempt = 0; attempt < 200; attempt++) {
		const value = await probe();
		if (value !== undefined) return value;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("timed out waiting for development checkout");
}

function exits(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }> {
	const outcome = () => {
		const spoolDevStdout = child as ChildProcess & { spoolDevStdout?: () => string };
		return { code: child.exitCode, signal: child.signalCode, stdout: spoolDevStdout.spoolDevStdout?.() ?? "" };
	};
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(outcome());
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", () => resolve(outcome()));
	});
}
