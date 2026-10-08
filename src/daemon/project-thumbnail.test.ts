import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import {
	makeApp,
	makeProject,
	makeTempDir,
	sseReader,
	writeDesignFile,
	writeFrame,
	writePageFrame,
} from "../test-helpers";
import { THUMBNAIL_MAX_BYTES } from "./project-thumbnail";
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

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9"/></svg>';

describe("a project's thumbnail file", () => {
	it("is its picture on Home when design/shared/thumbnail.* is there, and is served at its hash", async () => {
		const { spoolDir, root, name } = project();
		placedFrame(root, "home", { x: 0, y: 0 });
		writeDesignFile(root, "shared/thumbnail.svg", SVG);
		const card = await cardOf(spoolDir, root);
		expect(card?.thumbnail).toEqual({
			path: "design/shared/thumbnail.svg",
			hash: expect.stringMatching(/^[0-9a-f]{32}$/),
		});

		const app = makeApp(spoolDir);
		const got = await app.request(`/thumbnails/${name}/${card?.thumbnail?.hash}`);
		expect(got.status).toBe(200);
		expect(got.headers.get("content-type")).toBe("image/svg+xml");
		expect(got.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
		expect(got.headers.get("x-content-type-options")).toBe("nosniff");
		expect(got.headers.get("cache-control")).toContain("immutable");
		expect(await got.text()).toBe(SVG);
		expect((await app.request(`/thumbnails/${name}/${"0".repeat(32)}`)).status).toBe(404);
		expect((await app.request(`/thumbnails/${name}/not-a-hash`)).status).toBe(404);
	});

	it("looks for its kinds in order, svg first, and is never the icon", async () => {
		const { spoolDir, root } = project();
		writeDesignFile(root, "shared/icon.svg", SVG);
		writeDesignFile(root, "shared/thumbnail.jpg", "jpg bytes");
		writeDesignFile(root, "shared/thumbnail.png", "png bytes");
		expect((await cardOf(spoolDir, root))?.thumbnail?.path).toBe("design/shared/thumbnail.png");
	});

	it("is refused when it is a link or past the cap, and the top-left frame shows", async () => {
		const { spoolDir, root } = project();
		placedFrame(root, "home", { x: 0, y: 0 });
		const secret = join(makeTempDir(), "secret.svg");
		writeFileSync(secret, SVG);
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(secret, join(root, "design", "shared", "thumbnail.svg"));
		writeDesignFile(root, "shared/thumbnail.png", "x".repeat(THUMBNAIL_MAX_BYTES + 1));
		const card = await cardOf(spoolDir, root);
		expect(card?.thumbnail).toBeUndefined();
		expect(card?.covers.map((cover) => cover.frame)).toEqual(["home"]);
	});
});

describe("setting and removing the thumbnail", () => {
	const setAs = (app: ReturnType<typeof makeApp>, name: string, frame: string, init: RequestInit = {}) =>
		app.request(`/api/p/${name}/thumbnail`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ frame }),
			...init,
		});

	it("writes the frame's still as it is now into shared/thumbnail, in its format, clearing the old file", async () => {
		const { spoolDir, root, name } = project();
		placedFrame(root, "home", { x: 0, y: 0 });
		placedFrame(root, "pricing", { x: 500, y: 0 });
		writeCover(root, "pricing", JPEG_BYTES);
		writeDesignFile(root, "shared/thumbnail.svg", SVG);
		writeDesignFile(root, "shared/thumbnails.css", "a {}");
		const app = makeApp(spoolDir);

		const set = await setAs(app, name, "pricing");
		expect(set.status).toBe(200);
		const { thumbnail } = (await set.json()) as { thumbnail: { path: string; hash: string } };
		expect(thumbnail.path).toBe("design/shared/thumbnail.jpg");
		const shared = join(root, "design", "shared");
		expect(
			readdirSync(shared)
				.filter((file) => file.startsWith("thumbnail"))
				.sort(),
		).toEqual(["thumbnail.jpg", "thumbnails.css"]);
		expect(readFileSync(join(shared, "thumbnail.jpg"))).toEqual(JPEG_BYTES);
		expect((await cardOf(spoolDir, root))?.thumbnail).toEqual(thumbnail);

		// a snapshot: the frame shot again later leaves the thumbnail as it was
		writeCover(root, "pricing", PNG_BYTES);
		expect(readFileSync(join(shared, "thumbnail.jpg"))).toEqual(JPEG_BYTES);
	});

	it("refuses a frame with no still yet, a frame that isn't there, and a request without the control token", async () => {
		const { spoolDir, root, name } = project();
		writeFrame(root, "bare", frameTsx("bare"));
		placedFrame(root, "home", { x: 0, y: 0 });
		const app = makeApp(spoolDir);
		const bare = await setAs(app, name, "bare");
		expect(bare.status).toBe(409);
		expect(await bare.json()).toEqual({ error: "This frame has no picture yet. Try again once it has one." });
		expect((await setAs(app, name, "nobody")).status).toBe(404);
		const untokened = await app.fetch(`/api/p/${name}/thumbnail`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ frame: "home" }),
		});
		expect(untokened.status).toBe(401);
		expect(existsSync(join(root, "design", "shared", "thumbnail.png"))).toBe(false);
	});

	it("removes shared/thumbnail.* and the card goes back to its top-left frame, saying so on the app stream", async () => {
		const { spoolDir, root } = project();
		placedFrame(root, "home", { x: 0, y: 0 });
		writeDesignFile(root, "shared/thumbnail.png", "png bytes");
		writeDesignFile(root, "shared/thumbnail.webp", "webp bytes");
		writeDesignFile(root, "shared/icon.svg", SVG);
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");

		const removed = await app.request("/api/projects/thumbnail/remove", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root }),
		});
		expect(removed.status).toBe(200);
		expect(await events.next()).toEqual({ event: "app", data: { kind: "thumbnail", root, thumbnail: null } });
		const left = readdirSync(join(root, "design", "shared"));
		expect(left.filter((file) => file.startsWith("thumbnail"))).toEqual([]);
		expect(left).toContain("icon.svg");
		const card = await cardOf(spoolDir, root);
		expect(card?.thumbnail).toBeUndefined();
		expect(card?.covers.map((cover) => cover.frame)).toEqual(["home"]);
	});

	it("tells the pages when the thumbnail file changes on disk by another hand", async () => {
		const { spoolDir, root } = project();
		const app = makeApp(spoolDir);
		// the watch seeds what each project shows before it listens
		await new Promise((resolve) => setTimeout(resolve, 100));
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");
		writeDesignFile(root, "shared/thumbnail.svg", SVG);
		const thumbnail = (await cardOf(spoolDir, root))?.thumbnail;
		expect(await events.next()).toEqual({ event: "app", data: { kind: "thumbnail", root, thumbnail } });
	});
});
