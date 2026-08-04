import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pxForCells } from "../term/cells";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import { realDesignDir } from "./design-path";
import { writePlacement } from "./geometry";
import { frameKind, listProjectFrames, readFrameGeometry } from "./projection";

describe("frame kinds", () => {
	it("discovers term.tsx folders as terminal frames beside html ones", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "web", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "tui", "term.tsx"), "// tui\n");

		const { frames } = listProjectFrames(root);
		expect(frames.map((f) => ({ name: f.name, kind: f.kind }))).toEqual([
			{ name: "tui", kind: "term" },
			{ name: "web", kind: "html" },
		]);
	});

	it("births terminal frames at 80×24, not phone-sized", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "tui", "term.tsx"), "// tui\n");

		const { frames } = listProjectFrames(root);
		const expected = pxForCells(80, 24);
		expect(frames[0]).toMatchObject({ w: expected.w, h: expected.h });
		// placement is durable, written through the same sidecar path
		const sidecar = JSON.parse(readFileSync(join(root, "design", "frames", "tui", "frame.json"), "utf8"));
		expect(sidecar).toMatchObject({ w: expected.w, h: expected.h });
	});

	it("names a folder holding both entries a conflict, and still shows it", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "both", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "both", "term.tsx"), "// tui\n");

		const designDir = realDesignDir(root);
		expect(frameKind(join(designDir, "frames", "both"), designDir)).toBe("conflict");
		const { frames } = listProjectFrames(root);
		expect(frames.map((f) => f.name)).toEqual(["both"]);
	});

	it("variants are just names — a --variant terminal frame discovers like any frame", () => {
		const root = makeTempDir();
		writeDesignFile(root, join("frames", "dash--empty", "term.tsx"), "// tui\n");
		const { frames } = listProjectFrames(root);
		expect(frames[0]).toMatchObject({ name: "dash--empty", kind: "term" });
	});
});

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

		expect(duringWrite).toMatchObject({ w: 390, h: 844 });
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
		sized(root, "wide", '{ "w": 1440, "h": 900 }\n');
		writeDesignFile(root, join("frames", "wide", "frame.tsx"), "export default () => null;\n");

		const frames = listProjectFrames(root).frames;
		const home = frames.find((frame) => frame.name === "home");
		const wide = frames.find((frame) => frame.name === "wide");

		expect(home).toMatchObject({ x: 80, y: 80, w: 390, h: 844 });
		expect(wide).toMatchObject({ x: 80 + 390 + 80, y: 80, w: 1440, h: 900 });
		// the whole point: no overlap, at either size
		expect(wide?.x).toBeGreaterThan((home?.x ?? 0) + (home?.w ?? 0));
	});

	it("sizes a terminal frame the same way, past its 80×24 floor", () => {
		const root = makeTempDir();
		sized(root, "shell", '{ "w": 1080, "h": 720 }\n');
		writeDesignFile(root, join("frames", "shell", "term.tsx"), "// tui\n");

		expect(listProjectFrames(root).frames[0]).toMatchObject({ kind: "term", w: 1080, h: 720 });
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

		for (const frame of frames) expect(frame).toMatchObject({ w: 390, h: 844 });
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

		const { frames, pages } = listProjectFrames(root);

		expect(frames).toEqual([]);
		// a folder with no frame entry is a page, and pages own no geometry
		expect(pages).toEqual(["pricing"]);
		expect(readFileSync(join(root, "design", "frames", "pricing", "frame.json"), "utf8")).toBe(
			'{ "w": 1440, "h": 900 }\n',
		);
	});
});

/**
 * Discovery to any depth (#231): a safe folder holding a frame entry is a
 * frame, one holding none is a page, and its own folders get the same question.
 * A page's identity is its path under frames/; a frame's is still its bare name.
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
		writeDesignFile(root, join("frames", "explorations", "chat", "deeper", "shell", "term.tsx"), "// tui\n");
		return root;
	}

	it("lists a page at every level and attributes each frame to its own path", () => {
		const { pages, frames } = listProjectFrames(deep());

		expect(pages).toEqual(["explorations", "explorations/chat", "explorations/chat/deeper"]);
		expect(frames.map((frame) => ({ name: frame.name, page: frame.page, kind: frame.kind }))).toEqual([
			{ name: "agent-chat", page: "explorations/chat", kind: "html" },
			{ name: "home", page: undefined, kind: "html" },
			{ name: "notes", page: "explorations", kind: "html" },
			{ name: "shell", page: "explorations/chat/deeper", kind: "term" },
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

	it("keeps a frame name identity across depths, so two claimants is a collision", () => {
		const root = deep();
		writeDesignFile(root, join("frames", "site", "notes", "frame.tsx"), "export default () => null;\n");

		const { frames, collisions } = listProjectFrames(root);
		expect(frames.some((frame) => frame.name === "notes")).toBe(false);
		expect(collisions).toEqual([{ name: "notes", paths: ["frames/explorations/notes", "frames/site/notes"] }]);
	});
});
