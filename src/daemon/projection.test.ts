import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import { realDesignDir } from "./design-path";
import { writePlacement } from "./geometry";
import {
	isPageFolder,
	listProjectFrames,
	lookupFrame,
	pagePaths,
	readFrameGeometry,
	summarizeProject,
} from "./projection";

describe("frame birth", () => {
	it("carries the folder's birth time so the finder can sort newest first", () => {
		const root = makeTempDir();
		const before = Date.now();
		writeDesignFile(root, join("frames", "fresh", "frame.tsx"), "export default () => null;\n");

		const { frames } = listProjectFrames(root);
		const born = frames[0]?.born ?? 0;
		expect(born).toBeGreaterThanOrEqual(before - 2000);
		expect(born).toBeLessThanOrEqual(Date.now() + 2000);
	});
});

describe("a frame on its way (#371)", () => {
	const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
		a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

	it("is a placeholder where its sidecar places it, never a page, and new frames stand clear of it", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "home", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "home", "frame.json"), '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		writeDesignFile(
			root,
			join("frames", "ideas", "home--split", "frame.json"),
			'{ "x": 0, "y": 0, "w": 390, "h": 844, "placeholder": { "title": "Split home", "brief": "Two panes." } }\n',
		);
		writeDesignFile(root, join("frames", "ideas", "home--calm", "frame.tsx"), "export default () => null;\n");

		const projection = listProjectFrames(root);
		expect(projection.pages).toEqual(["ideas"]);
		expect(projection.frames.map((frame) => frame.name)).toEqual(["home", "ideas/home--calm"]);
		expect(projection.placeholders).toEqual([
			{
				name: "ideas/home--split",
				page: "ideas",
				x: 0,
				y: 0,
				w: 390,
				h: 844,
				title: "Split home",
				brief: "Two panes.",
			},
		]);
		const calm = projection.frames.find((frame) => frame.name === "ideas/home--calm");
		expect(calm !== undefined && overlaps(calm, { x: 0, y: 0, w: 390, h: 844 })).toBe(false);
		expect(isPageFolder(join(realDesignDir(root), "frames", "ideas", "home--split"))).toBe(false);
		expect(lookupFrame(root, "ideas/home--split")).toEqual({ kind: "missing" });
	});

	it("is neither a page nor drawn while its sidecar has no place yet", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "sized", "frame.json"), '{ "w": 1440, "h": 900 }\n');
		writeDesignFile(root, join("frames", "torn", "frame.json"), '{ "x": 1');

		const projection = listProjectFrames(root);
		expect(projection).toMatchObject({ pages: [], frames: [], placeholders: [] });
	});

	it("is only a folder with no folders of its own: a page with a stray sidecar keeps its frames", async () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "shop", "frame.json"), '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		writeDesignFile(root, join("frames", "shop", "cart", "frame.tsx"), "export default () => null;\n");

		const projection = listProjectFrames(root);
		expect(projection.pages).toEqual(["shop"]);
		expect(projection.frames.map((frame) => frame.name)).toEqual(["shop/cart"]);
		expect(projection.placeholders).toEqual([]);
		expect(isPageFolder(join(realDesignDir(root), "frames", "shop"))).toBe(true);
		expect(await summarizeProject(root)).toMatchObject({ frameCount: 1 });
	});

	it("is never a page on the home card's walk either", async () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "only", "frame.json"), '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		expect(await summarizeProject(root)).toEqual({ frameCount: 0, covers: [] });
		expect(pagePaths(root)).toEqual(new Set());
	});
});

describe("projection placement", () => {
	it("preserves authored bytes when its missing-sidecar fill loses the create race", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "authored", "frame.tsx"), "export default () => null;\n");
		const designDir = realDesignDir(root);
		const sidecar = join(designDir, "frames", "authored", "frame.json");
		const authored = '{ "x": 19, "y": 23, "w": 640, "h": 480 }\n';
		writeFileSync(sidecar, authored);

		const won = writePlacement(sidecar, { x: 80, y: 80, w: 390, h: 844 }, designDir);

		expect(won).toEqual({ x: 19, y: 23, w: 640, h: 480 });
		expect(readFileSync(sidecar, "utf8")).toBe(authored);
	});

	it("completes a size authored between the sidecar read and the placing write", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "authored", "frame.tsx"), "export default () => null;\n");
		const designDir = realDesignDir(root);
		const sidecar = join(designDir, "frames", "authored", "frame.json");
		writeFileSync(sidecar, '{ "w": 1440, "h": 900 }\n');

		// the caller computed its geometry against a footprint that is now stale
		const won = writePlacement(sidecar, { x: 80, y: 80, w: 390, h: 844 }, designDir);

		expect(won).toEqual({ x: 80, y: 80, w: 1440, h: 900 });
		expect(JSON.parse(readFileSync(sidecar, "utf8"))).toEqual({ x: 80, y: 80, w: 1440, h: 900 });
	});

	it("never replaces a sidecar observed during an authored partial write", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "authored", "frame.tsx"), "export default () => null;\n");
		const sidecar = join(root, "design", "frames", "authored", "frame.json");
		const partial = '{ "x": 19, "y":';
		writeFileSync(sidecar, partial);

		const duringWrite = listProjectFrames(root).frames.find((frame) => frame.name === "authored");

		expect(duringWrite).toMatchObject({ w: 1440, h: 900 });
		expect(readFileSync(sidecar, "utf8")).toBe(partial);

		const authored = '{ "x": 19, "y": 23, "w": 640, "h": 480 }\n';
		writeFileSync(sidecar, authored);

		expect(listProjectFrames(root).frames.find((frame) => frame.name === "authored")).toMatchObject({
			x: 19,
			y: 23,
			w: 640,
			h: 480,
		});
		expect(readFileSync(sidecar, "utf8")).toBe(authored);
	});
});

/**
 * The agent writes size, spool writes position (#113). A sidecar holding a size
 * and no coordinate is a legal sidecar, so an agent asking for a desktop frame
 * never has to invent an x and y and never lands on top of another frame.
 */
describe("a sidecar that states size without position", () => {
	const sized = (root: string, frame: string, footprint: string): void => {
		writeDesignFile(root, join("frames", frame, "frame.json"), footprint);
	};

	it("projects at the authored size and comes back holding four numbers", () => {
		const root = makeTempDir();
		sized(root, "pricing", '{ "w": 1440, "h": 900 }\n');
		writeDesignFile(root, join("frames", "pricing", "frame.tsx"), "export default () => null;\n");

		expect(listProjectFrames(root).frames[0]).toMatchObject({ x: 80, y: 80, w: 1440, h: 900 });

		const sidecar = join(root, "design", "frames", "pricing", "frame.json");
		expect(JSON.parse(readFileSync(sidecar, "utf8"))).toEqual({ x: 80, y: 80, w: 1440, h: 900 });
		// durable: the second read is the first, not a fresh roll
		expect(listProjectFrames(root).frames[0]).toMatchObject({ x: 80, y: 80, w: 1440, h: 900 });
	});

	it("lands in clear space past the field, measured at the size it asked for", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "home", "frame.tsx"), "export default () => null;\n");
		listProjectFrames(root);
		sized(root, "wide", '{ "w": 2560, "h": 1440 }\n');
		writeDesignFile(root, join("frames", "wide", "frame.tsx"), "export default () => null;\n");

		const frames = listProjectFrames(root).frames;
		const home = frames.find((frame) => frame.name === "home");
		const wide = frames.find((frame) => frame.name === "wide");

		expect(home).toMatchObject({ x: 80, y: 80, w: 1440, h: 900 });
		expect(wide).toMatchObject({ x: 80 + 1440 + 80, y: 80, w: 2560, h: 1440 });
		// the whole point: no overlap, at either size
		expect(wide?.x).toBeGreaterThan((home?.x ?? 0) + (home?.w ?? 0));
	});

	it("shoots at the authored size before anything has placed the frame", () => {
		const root = makeTempDir();
		sized(root, "pricing", '{ "w": 1440, "h": 900 }\n');
		writeDesignFile(root, join("frames", "pricing", "frame.tsx"), "export default () => null;\n");

		expect(readFrameGeometry(root, "pricing")).toEqual({ w: 1440, h: 900, persisted: true });
	});

	it("leaves a size it cannot place alone, and the frame keeps the default", () => {
		const root = makeTempDir();
		for (const [frame, bytes] of [
			["zero", '{ "w": 0, "h": 900 }\n'],
			["negative", '{ "w": 1440, "h": -900 }\n'],
			["strings", '{ "w": "1440", "h": "900" }\n'],
			["half-placed", '{ "x": 19, "w": 1440, "h": 900 }\n'],
		] as const) {
			sized(root, frame, bytes);
			writeDesignFile(root, join("frames", frame, "frame.tsx"), "export default () => null;\n");
		}

		const frames = listProjectFrames(root).frames;

		for (const frame of frames) expect(frame).toMatchObject({ w: 1440, h: 900 });
		// nothing spool cannot read is rewritten, so an author's bytes survive
		for (const [frame, bytes] of [
			["zero", '{ "w": 0, "h": 900 }\n'],
			["negative", '{ "w": 1440, "h": -900 }\n'],
			["strings", '{ "w": "1440", "h": "900" }\n'],
			["half-placed", '{ "x": 19, "w": 1440, "h": 900 }\n'],
		] as const) {
			expect(readFileSync(join(root, "design", "frames", frame, "frame.json"), "utf8")).toBe(bytes);
		}
	});

	it("is not a frame until the source entry lands, so nothing places a bare sidecar", () => {
		const root = makeTempDir();
		sized(root, "pricing", '{ "w": 1440, "h": 900 }\n');

		const { frames, pages, placeholders } = listProjectFrames(root);

		expect(frames).toEqual([]);
		// a sidecar with no entry is a frame on its way, not a page (#371), and one with no place draws nothing
		expect(pages).toEqual([]);
		expect(placeholders).toEqual([]);
		expect(readFileSync(join(root, "design", "frames", "pricing", "frame.json"), "utf8")).toBe(
			'{ "w": 1440, "h": 900 }\n',
		);
	});
});

/**
 * Discovery to any depth (#231): a safe folder holding a frame entry is a
 * frame, one holding none is a page, and its own folders get the same question.
 * Both are named by their path under frames/ (#336), so a folder name only has
 * to be free among the folders beside it.
 */
describe("pages at any depth", () => {
	function deep(): string {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "home", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "explorations", "notes", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(
			root,
			join("frames", "explorations", "chat", "agent-chat", "frame.tsx"),
			"export default () => null;\n",
		);
		writeDesignFile(
			root,
			join("frames", "explorations", "chat", "deeper", "shell", "frame.tsx"),
			"export default () => null;\n",
		);
		return root;
	}

	it("lists a page at every level and attributes each frame to its own path", () => {
		const { pages, frames } = listProjectFrames(deep());

		expect(pages).toEqual(["explorations", "explorations/chat", "explorations/chat/deeper"]);
		expect(frames.map((frame) => ({ name: frame.name, page: frame.page }))).toEqual([
			{ name: "explorations/chat/agent-chat", page: "explorations/chat" },
			{ name: "explorations/chat/deeper/shell", page: "explorations/chat/deeper" },
			{ name: "explorations/notes", page: "explorations" },
			{ name: "home", page: undefined },
		]);
	});

	it("counts an empty folder at any depth as a page with nothing on it", () => {
		const root = deep();
		mkdirSync(join(root, "design", "frames", "explorations", "chat", "pricing"), { recursive: true });

		expect(listProjectFrames(root).pages).toContain("explorations/chat/pricing");
	});

	/** A frame born without a sidecar lands beside its own page's field, never another's. */
	it("places a new frame against the field of the page it is on", () => {
		const root = deep();
		writeDesignFile(
			root,
			join("frames", "explorations", "chat", "second", "frame.tsx"),
			"export default () => null;\n",
		);

		const { frames } = listProjectFrames(root);
		const held = frames.filter((frame) => frame.page === "explorations/chat");
		expect(held).toHaveLength(2);
		expect(new Set(held.map((frame) => frame.y)).size).toBe(1);
		expect(new Set(held.map((frame) => frame.x)).size).toBe(2);
	});

	it("keeps one folder name on two pages as two frames, each named by its path", () => {
		const root = deep();
		writeDesignFile(root, join("frames", "site", "notes", "frame.tsx"), "export default () => null;\n");

		const projection = listProjectFrames(root);
		expect(projection.frames.filter((frame) => frame.name.endsWith("notes")).map((frame) => frame.name)).toEqual([
			"explorations/notes",
			"site/notes",
		]);
		expect("collisions" in projection).toBe(false);
	});

	it("looks a frame up by walking its path, every folder above it a page", () => {
		const root = deep();
		writeDesignFile(root, join("frames", "home", "inner", "frame.tsx"), "export default () => null;\n");

		expect(lookupFrame(root, "explorations/chat/agent-chat")).toEqual({
			kind: "found",
			dir: join(realDesignDir(root), "frames", "explorations", "chat", "agent-chat"),
			page: "explorations/chat",
		});
		expect(lookupFrame(root, "home")).toMatchObject({ kind: "found" });
		expect("page" in lookupFrame(root, "home")).toBe(false);
		for (const name of [
			"agent-chat",
			"explorations/chat",
			"explorations",
			"home/inner",
			"explorations/../home",
			"../design/frames/home",
			".spool",
			"explorations//notes",
			"explorations\\notes",
			"",
		]) {
			expect(lookupFrame(root, name), name).toEqual({ kind: "missing" });
		}
	});
});
