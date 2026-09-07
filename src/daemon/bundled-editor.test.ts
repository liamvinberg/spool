import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { buildBundledEditor } from "./bundled-editor";

function gate() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

it("keeps the observed editor in the actual SDK's file mutation queue", async () => {
	const root = makeTempDir();
	const file = join(root, "outside.txt");
	writeFileSync(file, "before");
	const output = join(root, "observed.mjs");
	await buildBundledEditor(output, true);
	const loaded: { createEditTool(cwd: string): AgentTool } = await import(pathToFileURL(output).href);
	const entered = gate();
	const release = gate();
	const held = withFileMutationQueue(file, async () => {
		entered.resolve();
		await release.promise;
	});
	await entered.promise;
	const edit = loaded
		.createEditTool(root)
		.execute("edit", { path: file, edits: [{ oldText: "before", newText: "after" }] });
	try {
		// SDK registration is ordered even across files. This proves the edit has
		// registered while its original queue remains occupied, without a sleep.
		await withFileMutationQueue(join(root, "other.txt"), async () => {});
		expect(readFileSync(file, "utf8")).toBe("before");
	} finally {
		release.resolve();
		await held;
		await edit;
	}
	expect(readFileSync(file, "utf8")).toBe("after");
});
