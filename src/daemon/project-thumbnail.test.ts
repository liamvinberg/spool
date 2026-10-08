import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame, writePageFrame } from "../test-helpers";
import { writeCover } from "./thumbs";

/** Smallest real PNG: 1×1 transparent pixel. */
const PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	"base64",
);

/** Smallest real JPEG: 1×1. */
const JPEG_BYTES = Buffer.from(
	"/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
	"base64",
);

/** Store a rail order in canvas.json beside what is already there. */
function writeCanvasOrder(root: string, order: unknown): void {
	const file = join(root, "design", "canvas.json");
	writeFileSync(file, `${JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), order })}\n`);
}

const frameTsx = (label: string) => `export default function Frame() {
	return <p>${label}</p>;
}
`;

function project() {
	const spoolDir = join(makeTempDir(), ".spool");
	return { spoolDir, ...makeProject(spoolDir) };
}

/** A frame at a place, with a still. */
function placedFrame(root: string, name: string, at: { x: number; y: number }, page?: string): void {
	if (page === undefined) writeFrame(root, name, frameTsx(name));
	else writePageFrame(root, page, name, frameTsx(name));
	const path = page === undefined ? name : `${page}/${name}`;
	writeDesignFile(root, `frames/${path}/frame.json`, JSON.stringify({ ...at, w: 390, h: 844 }));
	writeCover(root, path, PNG_BYTES);
}

interface Card {
	root: string;
	covers: { frame: string }[];
	thumbnail?: { path: string; hash: string };
}

async function cardOf(spoolDir: string, root: string): Promise<Card | undefined> {
	const app = makeApp(spoolDir);
	const { projects } = (await (await app.request("/api/projects")).json()) as { projects: Card[] };
	return projects.find((card) => card.root === root);
}

describe("a project's picture on Home without a thumbnail file", () => {
	it("is the top-left frame of the root page: the smallest top edge, ties to the smallest left", async () => {
		const { spoolDir, root } = project();
		placedFrame(root, "low", { x: -500, y: 300 });
		placedFrame(root, "right", { x: 900, y: 0 });
		placedFrame(root, "left", { x: 100, y: 0 });
		placedFrame(root, "elsewhere", { x: -900, y: -900 }, "shop");
		expect((await cardOf(spoolDir, root))?.covers.map((cover) => cover.frame)).toEqual(["left"]);
	});

	it("stays the same frame when another frame is shot again", async () => {
		const { spoolDir, root } = project();
		placedFrame(root, "first", { x: 0, y: 0 });
		placedFrame(root, "second", { x: 500, y: 0 });
		writeCover(root, "second", JPEG_BYTES);
		expect((await cardOf(spoolDir, root))?.covers.map((cover) => cover.frame)).toEqual(["first"]);
	});

	it("falls back to the first page in rail order, and that page's own top-left", async () => {
		const { spoolDir, root } = project();
		placedFrame(root, "a", { x: 0, y: 0 }, "alpha");
		placedFrame(root, "low", { x: 0, y: 400 }, "beta");
		placedFrame(root, "high", { x: 300, y: 100 }, "beta");
		// the rail puts beta first; alpha is only first by name
		writeCanvasOrder(root, { pages: ["beta", "alpha"] });
		expect((await cardOf(spoolDir, root))?.covers.map((cover) => cover.frame)).toEqual(["beta/high"]);
	});

	it("goes down into a page's own pages before the pages after it, as the rail does", async () => {
		const { spoolDir, root } = project();
		placedFrame(root, "deep", { x: 0, y: 0 }, "alpha/inner");
		placedFrame(root, "next", { x: 0, y: 0 }, "beta");
		expect((await cardOf(spoolDir, root))?.covers.map((cover) => cover.frame)).toEqual(["alpha/inner/deep"]);
	});

	it("shows nothing while that frame has no still", async () => {
		const { spoolDir, root } = project();
		writeFrame(root, "bare", frameTsx("bare"));
		writeDesignFile(root, "frames/bare/frame.json", JSON.stringify({ x: 0, y: 0, w: 390, h: 844 }));
		placedFrame(root, "shot", { x: 500, y: 0 });
		expect((await cardOf(spoolDir, root))?.covers).toEqual([]);
	});
});
