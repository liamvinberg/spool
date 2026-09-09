import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

/**
 * The run's shared scratch: the canvas bundle is built once here by the first
 * browser test that needs it (`builtUi` in test-helpers) and read by all the
 * rest. A unit-only run never builds anything.
 */
export default function setup(project: TestProject): () => void {
	const dir = mkdtempSync(join(tmpdir(), "spool-test-run-"));
	project.provide("spoolTestRunDir", dir);
	return () => rmSync(dir, { recursive: true, force: true });
}
