import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { literal, Sources } from "./source-origins";

it("reads original source ranges and module bindings after an independent writer changes current files", async () => {
	const { root } = makeProject(makeTempDir());
	const source = 'import {Label} from "shared/label"; export default function Frame(){return <Label label="Before"/>}';
	writeFrame(root, "home", source);
	writeDesignFile(root, "shared/label.tsx", "export function Label({label}) {return <h1>{label}</h1>}");
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const original = id ? compiler.publication(id)?.compilation : undefined;
	if (!original) throw new Error("no source publication");
	writeFileSync(join(root, "design/frames/home/frame.tsx"), "const independent = 1;\n" + source);
	writeDesignFile(root, "shared/label.ts", "export function Label(){return null}");
	const sources = new Sources(root, original);
	const entry = sources.read("frames/home/frame.tsx");
	const site = sources.site(`frames/home/frame.tsx:1:${source.indexOf("<Label") + 1}`);
	expect(entry.text).toBe(source);
	expect(literal(site, "label")).toBe("Before");
	expect(sources.resolve(entry, "shared/label").path).toBe("shared/label.tsx");
	expect(sources.resolve(entry, "shared/label").text).toContain("<h1>{label}</h1>");
});
