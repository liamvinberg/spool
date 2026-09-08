import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";

it("compiles historical frozen source and CSS without writing or registering authority", async () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "home", 'import "./theme.css"; export default function Frame(){return <h1>Hello</h1>}');
	writeDesignFile(root, "frames/home/theme.css", ".host{color:red}");
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const original = id ? compiler.publication(id)?.compilation : undefined;
	if (!original) throw new Error("no original compilation");
	const css = realpathSync(join(root, "design/frames/home/theme.css"));
	writeDesignFile(root, "frames/home/theme.css", ".host{color:blue}");
	const snapshot = await compiler.compileSnapshot(root, "home", original.inputs, 17, original.absent, original);
	expect(snapshot.packet.bundledCss).toContain("red");
	expect(snapshot.packet.bundledCss).not.toContain("blue");
	expect(compiler.publication(snapshot.packet.id)).toBeUndefined();
	expect(readFileSync(css, "utf8")).toBe(".host{color:blue}");
	await expect(
		compiler.compilePublication(root, "home", original.inputs, 17, original.absent, original),
	).rejects.toThrow("source changed");
	const missing = new Map(original.inputs);
	missing.delete(css);
	await expect(compiler.compileSnapshot(root, "home", missing, 18, original.absent, original)).rejects.toThrow(
		"unpublished dependency",
	);
});
