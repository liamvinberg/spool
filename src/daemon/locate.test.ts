import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { lineRangeOf } from "./locate";

/**
 * The canvas asks and the daemon answers (#214). The canvas holds the strings one
 * edit was made of and never the file; the daemon owns the file and never sees a
 * tool call. A line range is what crosses between them.
 */

const HOME = `export default function Home() {
	return (
		<main>
			<h1>kaffe</h1>
			<p>open until six</p>
		</main>
	);
}
`;

describe("the lines a string occupies", () => {
	it("counts from one and ends on the last line the string reaches", () => {
		const text = "a\nb\nc\nd\n";
		expect(lineRangeOf(text, "a")).toEqual({ from: 1, to: 1 });
		expect(lineRangeOf(text, "c")).toEqual({ from: 3, to: 3 });
		expect(lineRangeOf(text, "b\nc")).toEqual({ from: 2, to: 3 });
	});

	it("gives a trailing newline to the line it ends rather than the next one", () => {
		// a block written whole ends with a newline, and counting it would put the mark
		// one line past the last thing that changed
		expect(lineRangeOf("a\nb\nc\n", "b\n")).toEqual({ from: 2, to: 2 });
		expect(lineRangeOf("a\nb\n\nc\n", "a\nb\n\n")).toEqual({ from: 1, to: 2 });
	});

	it("answers nothing for a string the file does not hold, and for none at all", () => {
		expect(lineRangeOf("a\nb\n", "z")).toBeUndefined();
		expect(lineRangeOf("a\nb\n", "")).toBeUndefined();
	});
});

describe("the locate surface", () => {
	it("answers a design-relative path and the range the first hit occupies", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", HOME);
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/locate`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: join(root, "design/frames/home/frame.tsx"), find: ["<p>open until six</p>"] }),
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ range: { path: "frames/home/frame.tsx", from: 5, to: 5 } });
	});

	it("takes the first of the strings it is given that the file still holds", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", HOME);
		const app = makeApp(spoolDir);

		// what the write put there, and behind it what it replaced: only one of the two
		// can be in the file, and which one depends on whether the write has landed yet
		const res = await app.request(`/api/p/${name}/locate`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				path: "design/frames/home/frame.tsx",
				find: ["<p>closed sundays</p>", "<h1>kaffe</h1>"],
			}),
		});

		expect(await res.json()).toEqual({ range: { path: "frames/home/frame.tsx", from: 4, to: 4 } });
	});

	it("answers null for a file that has already moved on, and for one outside design/", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", HOME);
		const app = makeApp(spoolDir);
		const locate = (body: unknown) =>
			app.request(`/api/p/${name}/locate`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		const gone = await locate({ path: "design/frames/home/frame.tsx", find: ["<p>closed sundays</p>"] });
		expect(await gone.json()).toEqual({ range: null });

		const outside = await locate({ path: join(root, "package.json"), find: ["name"] });
		expect(await outside.json()).toEqual({ range: null });

		const missing = await locate({ path: "design/frames/ghost/frame.tsx", find: ["anything"] });
		expect(await missing.json()).toEqual({ range: null });
	});

	it("locates a shared component, which is the file two frames read", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", HOME);
		writeDesignFile(root, "shared/ui/badge.tsx", "export function Badge() {\n\treturn <span>new</span>;\n}\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/locate`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: "design/shared/ui/badge.tsx", find: ["<span>new</span>"] }),
		});

		expect(await res.json()).toEqual({ range: { path: "shared/ui/badge.tsx", from: 2, to: 2 } });
	});

	it("refuses a body that is not a path and a list of strings", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);
		const post = (body: unknown) =>
			app.request(`/api/p/${name}/locate`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		expect((await post({ find: ["a"] })).status).toBe(400);
		expect((await post({ path: "design/frames/home/frame.tsx" })).status).toBe(400);
		expect((await post({ path: "design/frames/home/frame.tsx", find: [3] })).status).toBe(400);
		expect((await post({ path: "", find: ["a"] })).status).toBe(400);
	});
});
