import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { makeApp, makeProject, makeTempDir, sseReader, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * The canvas's hands over the API (#23), under the one law: the canvas never
 * writes frame source. Selection is daemon memory served as #6's payload;
 * geometry writes touch frame.json alone; delete rides the OS Trash seam;
 * open-in-editor jumps to path:line and never leaves design/.
 */

const frameTsx = `export default function Frame() {
	return (
		<main>
			<button className="pay">Pay now</button>
		</main>
	);
}
`;

function jsonPut(body: unknown): RequestInit {
	return { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function jsonPost(body: unknown): RequestInit {
	return { ...jsonPut(body), method: "POST" };
}

describe("the selection API", () => {
	it("starts empty and round-trips a frame selection with path and size", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		writeDesignFile(root, "frames/checkout/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
		const app = makeApp(spoolDir);

		expect(await (await app.request(`/api/p/${name}/selection`)).json()).toEqual({ selection: [] });

		const put = await app.request(`/api/p/${name}/selection`, jsonPut({ frames: ["checkout"] }));
		expect(put.status).toBe(204);

		expect(await (await app.request(`/api/p/${name}/selection`)).json()).toEqual({
			selection: [
				{ kind: "frame", frame: "checkout", path: "design/frames/checkout/frame.tsx", size: { w: 800, h: 600 } },
			],
		});
	});

	it("serves an element selection as path/lines/selector/excerpt from the stamp", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		// the button's stamp: line 4, column 4 of frame.tsx (tabs count as one)
		const put = await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > button",
						outerHtml: '<button class="pay">Pay now</button>',
						source: "frames/checkout/frame.tsx:4:4",
						generated: false,
					},
				],
			}),
		);
		expect(put.status).toBe(204);

		expect(await (await app.request(`/api/p/${name}/selection`)).json()).toEqual({
			selection: [
				{
					kind: "element",
					frame: "checkout",
					path: "design/frames/checkout/frame.tsx",
					lines: [4, 4],
					selector: "main > button",
					excerpt: '<button className="pay">Pay now</button>',
				},
			],
		});
	});

	it("serves a multi-element selection as one entry per element, in put order", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		const put = await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > button",
						outerHtml: '<button class="pay">Pay now</button>',
						source: "frames/checkout/frame.tsx:4:4",
						generated: false,
					},
					{
						frame: "checkout",
						selector: "main",
						outerHtml: "<main></main>",
						source: "frames/checkout/frame.tsx:3:3",
						generated: false,
					},
				],
			}),
		);
		expect(put.status).toBe(204);

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<Record<string, unknown>>;
		};
		expect(selection.map((entry) => [entry.kind, entry.selector, entry.lines])).toEqual([
			["element", "main > button", [4, 4]],
			["element", "main", [3, 5]],
		]);
	});

	it("degrades generated elements honestly: ancestor lines, live outerHTML excerpt", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > ul > li:nth-of-type(2)",
						outerHtml: "<li>b</li>",
						source: "frames/checkout/frame.tsx:3:3",
						generated: true,
					},
				],
			}),
		);

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<Record<string, unknown>>;
		};
		expect(selection[0]).toMatchObject({
			kind: "element",
			generated: true,
			lines: [3, 5],
			excerpt: "<li>b</li>",
			selector: "main > ul > li:nth-of-type(2)",
		});
	});

	it("treats a stamp escaping design/ as no stamp at all", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		await app.request(
			`/api/p/${name}/selection`,
			jsonPut({
				elements: [
					{
						frame: "checkout",
						selector: "main > i",
						outerHtml: "<i>x</i>",
						source: "../../secrets.txt:1:1",
						generated: false,
					},
				],
			}),
		);

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<Record<string, unknown>>;
		};
		expect(selection[0]).toMatchObject({
			path: "design/frames/checkout/frame.tsx",
			lines: [1, 1],
			excerpt: "<i>x</i>",
			generated: true,
		});
	});

	it("rejects malformed selections and unsafe frame names", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/selection`, jsonPut({}))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ frames: ["../escape"] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ frames: [42] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ elements: [{ frame: "x" }] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut({ elements: "main" }))).status).toBe(400);
	});

	it("drops selected frames that no longer exist instead of fabricating entries", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		await app.request(`/api/p/${name}/selection`, jsonPut({ frames: ["checkout", "ghost"] }));

		const { selection } = (await (await app.request(`/api/p/${name}/selection`)).json()) as {
			selection: Array<{ frame: string }>;
		};
		expect(selection.map((entry) => entry.frame)).toEqual(["checkout"]);
	});
});

describe("the geometry API", () => {
	it("writes moved and resized geometry to the sidecar alone — frame source untouched", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		writeFrame(root, "menu", frameTsx);
		const app = makeApp(spoolDir);
		await app.request(`/api/p/${name}/frames`); // sidecars filled in

		const sources = ["checkout", "menu"].map((frame) => {
			const file = join(root, "design", "frames", frame, "frame.tsx");
			return { file, bytes: readFileSync(file), mtime: statSync(file).mtimeMs };
		});

		const put = await app.request(
			`/api/p/${name}/geometry`,
			jsonPut({
				frames: { checkout: { x: -20, y: 40, w: 800, h: 600 }, menu: { x: 900, y: 40.4, w: 390, h: 844 } },
			}),
		);
		expect(put.status).toBe(204);

		// the seam (#23): move and resize write geometry, never source
		for (const source of sources) {
			expect(readFileSync(source.file)).toEqual(source.bytes);
			expect(statSync(source.file).mtimeMs).toBe(source.mtime);
		}
		expect(JSON.parse(readFileSync(join(root, "design", "frames", "checkout", "frame.json"), "utf8"))).toEqual({
			x: -20,
			y: 40,
			w: 800,
			h: 600,
		});
		// geometry lands as integers
		expect(JSON.parse(readFileSync(join(root, "design", "frames", "menu", "frame.json"), "utf8"))).toEqual({
			x: 900,
			y: 40,
			w: 390,
			h: 844,
		});

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: Array<{ name: string; x: number }>;
		};
		expect(frames.find((f) => f.name === "checkout")?.x).toBe(-20);
	});

	it("publishes a geometry event, never a frame change, for sidecar writes", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());

		const stream = await app.request(`/api/p/${name}/events`, { signal: controller.signal });
		const events = sseReader(stream);
		expect((await events.next()).event).toBe("hello");
		// macOS FSEvents can replay the setup writes from just before the stream
		// armed — flush them so the assertions below see only the PUT's doing
		await events.drain(400);

		await app.request(`/api/p/${name}/geometry`, jsonPut({ frames: { checkout: { x: 1, y: 2, w: 300, h: 400 } } }));

		expect(await events.next()).toEqual({ event: "change", data: { kind: "geometry", frame: "checkout" } });
		// the watcher stays silent about frame.json — no reload-inducing echo
		await events.expectQuiet(300);
	});

	it("rejects unknown frames before writing anything, and malformed geometry", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		const ghost = await app.request(
			`/api/p/${name}/geometry`,
			jsonPut({ frames: { checkout: { x: 0, y: 0, w: 100, h: 100 }, ghost: { x: 0, y: 0, w: 100, h: 100 } } }),
		);
		expect(ghost.status).toBe(404);
		// all-or-nothing: the known frame's sidecar was not written either
		expect(existsSync(join(root, "design", "frames", "checkout", "frame.json"))).toBe(false);

		expect((await app.request(`/api/p/${name}/geometry`, jsonPut({ frames: { checkout: { x: 0 } } }))).status).toBe(
			400,
		);
		expect(
			(await app.request(`/api/p/${name}/geometry`, jsonPut({ frames: { checkout: { x: 0, y: 0, w: 0, h: 100 } } })))
				.status,
		).toBe(400);
	});

	it("answers 400, never 500, to a null JSON body on every hands route", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { moveToTrash: async () => {}, launchEditor: () => {} });

		expect((await app.request(`/api/p/${name}/geometry`, jsonPut(null))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost(null))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/editor`, jsonPost(null))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/selection`, jsonPut(null))).status).toBe(400);
	});
});

describe("the trash API", () => {
	it("moves whole frame folders through the OS Trash seam", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		writeFrame(root, "menu", frameTsx);
		const graveyard = makeTempDir();
		const trashed: string[] = [];
		const app = makeApp(spoolDir, {
			moveToTrash: async (paths) => {
				for (const path of paths) {
					trashed.push(path);
					renameSync(path, join(graveyard, basename(path)));
				}
			},
		});

		const res = await app.request(`/api/p/${name}/trash`, jsonPost({ frames: ["checkout"] }));

		expect(res.status).toBe(204);
		expect(trashed).toEqual([join(root, "design", "frames", "checkout")]);
		expect(existsSync(join(root, "design", "frames", "checkout"))).toBe(false);
		expect(existsSync(join(graveyard, "checkout", "frame.tsx"))).toBe(true);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: Array<{ name: string }>;
		};
		expect(frames.map((f) => f.name)).toEqual(["menu"]);
	});

	it("refuses ghosts and unsafe names without touching the trash", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const moveToTrash = vi.fn(async () => {});
		const app = makeApp(spoolDir, { moveToTrash });

		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ frames: [] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ frames: ["../escape"] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ frames: ["checkout", "ghost"] }))).status).toBe(404);
		expect(moveToTrash).not.toHaveBeenCalled();
		expect(existsSync(join(root, "design", "frames", "checkout", "frame.tsx"))).toBe(true);
	});
});

describe("the editor API", () => {
	it("launches the editor on path:line inside design/", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const launchEditor = vi.fn();
		const app = makeApp(spoolDir, { launchEditor });

		const res = await app.request(
			`/api/p/${name}/editor`,
			jsonPost({ path: "design/frames/checkout/frame.tsx", line: 4 }),
		);

		expect(res.status).toBe(204);
		expect(launchEditor).toHaveBeenCalledWith(`${join(root, "design", "frames", "checkout", "frame.tsx")}:4`);

		await app.request(`/api/p/${name}/editor`, jsonPost({ path: "design/frames/checkout/frame.tsx" }));
		expect(launchEditor).toHaveBeenLastCalledWith(join(root, "design", "frames", "checkout", "frame.tsx"));
	});

	it("refuses paths outside design/ and files that do not exist", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		mkdirSync(join(root, "src"), { recursive: true });
		writeDesignFile(root, "../src/app.ts", "export {};\n");
		const launchEditor = vi.fn();
		const app = makeApp(spoolDir, { launchEditor });

		expect((await app.request(`/api/p/${name}/editor`, jsonPost({ path: "src/app.ts" }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/editor`, jsonPost({ path: "design/../src/app.ts" }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/editor`, jsonPost({ path: "/etc/hosts" }))).status).toBe(400);
		expect(
			(await app.request(`/api/p/${name}/editor`, jsonPost({ path: "design/frames/ghost/frame.tsx" }))).status,
		).toBe(404);
		expect((await app.request(`/api/p/${name}/editor`, jsonPost({ path: "design/x.ts", line: 0 }))).status).toBe(400);
		expect(launchEditor).not.toHaveBeenCalled();
	});
});
