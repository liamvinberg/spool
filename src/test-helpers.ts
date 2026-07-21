import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { onTestFinished } from "vitest";
import { createDaemonApp } from "./daemon/app";
import { initProject } from "./init";
import { canvasJson } from "./templates";

export function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "spool-test-"));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

export function markProject(root: string): void {
	mkdirSync(join(root, "design"), { recursive: true });
	writeFileSync(join(root, "design", "canvas.json"), canvasJson);
}

/** A registered project scaffolded through the real init path. */
export function makeProject(spoolDir: string): { root: string; name: string } {
	const dir = makeTempDir();
	const { root } = initProject(dir, spoolDir);
	return { root, name: basename(root) };
}

export function writeDesignFile(root: string, rel: string, content: string): void {
	const file = join(root, "design", rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

export function writeFrame(root: string, name: string, tsx: string): void {
	writeDesignFile(root, join("frames", name, "frame.tsx"), tsx);
}

/** A daemon app on a given ~/.spool dir, closed with the test. */
export function makeApp(spoolDir: string) {
	const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test" });
	onTestFinished(() => daemon.close());
	return daemon.app;
}
