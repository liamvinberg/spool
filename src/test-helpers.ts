import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
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
