import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";

it("captures and freezes both computed choices and transitive modules before publishing the served frame", async () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(
		root,
		"home",
		`import {lazy,Suspense} from 'react';globalThis.pick='first';const Pick=lazy(()=>import('./parts/'+globalThis.pick+'.tsx'));export default function Frame(){return <Suspense fallback={<i>Wait</i>}><Pick label="Same"/></Suspense>}`,
	);
	writeDesignFile(root, "frames/home/parts/first.tsx", `export {default} from '../leaf';`);
	writeDesignFile(
		root,
		"frames/home/parts/second.tsx",
		`export default function Button({label}){return <button>{label}</button>}`,
	);
	writeDesignFile(
		root,
		"frames/home/leaf.tsx",
		`export default function Button({label}){return <button>{label}</button>}`,
	);
	mkdirSync(join(root, "design/frames/home/parts/empty"));
	const compiler = createFrameCompiler("test"),
		authority = { projectCapability: "test", controlOrigin: "http://localhost" };
	const first = await compiler.getDocument(root, "home", authority);
	if (first.kind !== "ok") throw new Error(first.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(first.document)?.[1];
	const held = id ? compiler.publication(id)?.compilation : undefined;
	if (!held) throw new Error("missing captured publication");
	for (const path of [
		"frames/home/frame.tsx",
		"frames/home/parts/first.tsx",
		"frames/home/parts/second.tsx",
		"frames/home/leaf.tsx",
	])
		expect(held.inputs.has(join(root, "design", path)), path).toBe(true);
	expect(held.directories.has(join(root, "design/frames/home/parts"))).toBe(true);
	expect(held.globDiscoveries).toEqual([
		{
			importer: join(root, "design/frames/home/frame.tsx"),
			files: [join(root, "design/frames/home/parts/first.tsx"), join(root, "design/frames/home/parts/second.tsx")],
			directories: [join(root, "design/frames/home/parts"), join(root, "design/frames/home/parts/empty")],
		},
	]);
	const incomplete = new Map(held.inputs);
	incomplete.delete(join(root, "design/frames/home/parts/second.tsx"));
	await expect(compiler.compilePublication(root, "home", incomplete, 1, held.absent, held)).rejects.toThrow(
		"unpublished dependency",
	);
	expect(await compiler.getDocument(root, "home", authority)).toMatchObject({
		kind: "ok",
		cache: "hit",
		etag: first.etag,
	});
	writeDesignFile(
		root,
		"frames/home/parts/empty/third.tsx",
		`export default function Third(){return <button>Third</button>}`,
	);
	const next = await compiler.getDocument(root, "home", authority);
	expect(next).toMatchObject({ kind: "ok", cache: "miss" });
	if (next.kind !== "ok") throw new Error(next.message);
	expect(next.etag).not.toBe(first.etag);
});
