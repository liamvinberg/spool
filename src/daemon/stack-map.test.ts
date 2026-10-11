import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { documentLocator, mapBootStacks, mapStack } from "./stack-map";

const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };

/** The document's line and column, zero-based, of the first time some text appears in it. */
function positionOf(document: string, text: string): { line: number; column: number } {
	const at = document.indexOf(text);
	const before = document.slice(0, at);
	return { line: before.split("\n").length - 1, column: at - (before.lastIndexOf("\n") + 1) };
}

describe("a boot's stack, read back to the frame's files", () => {
	it("maps a line of the served document to the shared file and line that threw", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeDesignFile(
			root,
			"shared/ui/boom.tsx",
			`export function Boom() {
	const reason = "boom";
	throw new Error(reason);
}
`,
		);
		writeFrame(
			root,
			"home",
			`import { Boom } from "shared/ui/boom";
export default function Home() {
	return <Boom />;
}
`,
		);
		const compiler = createFrameCompiler("0.0.0-test");
		const doc = await compiler.getDocument(root, "home", authority);
		if (doc.kind !== "ok") throw new Error("the frame did not compile");
		const map = await compiler.sourceMap(root, "home");
		if (map === undefined) throw new Error("no source map");
		const locate = documentLocator(doc.document, map);
		if (locate === undefined) throw new Error("the bundle is not in the document");
		const at = positionOf(doc.document, "throw new Error(reason)");
		expect(locate(at.line, at.column)).toBe("shared/ui/boom.tsx:3:2");

		const url = "http://run.spool.localhost:7767/p/shop/frames/home";
		const stack = [
			"Error: boom",
			`    at Boom (${url}:${at.line + 1}:${at.column + 1})`,
			"    at ci (http://run.spool.localhost:7767/vendor/react.js:8:47849)",
		].join("\n");
		const boot = await mapBootStacks(
			{
				errors: [stack],
				entries: [
					{ type: "pageerror", text: stack },
					{ type: "log", text: "kept" },
				],
			},
			doc.document,
			"/p/shop/frames/home",
			async () => map,
		);
		expect(boot.errors).toEqual(["Error: boom\n    at Boom (shared/ui/boom.tsx:3:2)"]);
		expect(boot.entries).toEqual([
			{ type: "pageerror", text: "Error: boom\n    at Boom (shared/ui/boom.tsx:3:2)" },
			{ type: "log", text: "kept" },
		]);
	});

	it("answers no map for a document that inlines another bundle", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		const compiler = createFrameCompiler("0.0.0-test");
		const map = await compiler.sourceMap(root, "home");
		if (map === undefined) throw new Error("no source map");
		expect(documentLocator('<script type="module">something else</script>', map)).toBeUndefined();
		expect(await compiler.sourceMap(root, "missing")).toBeUndefined();
	});

	it("keeps a stack with nothing in the document as it was, cut short", () => {
		const library = Array.from({ length: 12 }, (_, i) => `    at f${i} (https://esm.sh/lib.mjs:1:${i})`);
		const mapped = mapStack(
			["TypeError: x is undefined", ...library].join("\n"),
			() => false,
			() => undefined,
		);
		expect(mapped.split("\n")).toEqual(["TypeError: x is undefined", ...library.slice(0, 8)]);
	});

	it("leaves a document line it cannot place, and drops the library around the frame's own", () => {
		const stack = [
			"Error: boom",
			"    at http://doc/p/a/frames/b:10:2",
			"    at Inner (http://doc/p/a/frames/b:20:4)",
			"    at react (http://doc/vendor/react.js:1:1)",
		].join("\n");
		const isDocument = (url: string) => url.startsWith("http://doc/p/");
		expect(mapStack(stack, isDocument, (line) => (line === 19 ? "frames/b/frame.tsx:4:1" : undefined))).toBe(
			"Error: boom\n    at Inner (frames/b/frame.tsx:4:1)",
		);
		expect(mapStack(stack, isDocument, () => undefined)).toBe(stack);
	});
});
