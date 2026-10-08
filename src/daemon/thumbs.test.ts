import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir } from "../test-helpers";
import {
	coverSize,
	imageSize,
	readCaptureError,
	readCover,
	readCoverAwaited,
	readCoverImage,
	scanCoverSchemes,
	scanCovers,
	scanPaces,
	scanPreBoothCovers,
	writeCaptureError,
	writeCover,
	writePace,
} from "./thumbs";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
const OTHER_JPEG = Buffer.from([0xff, 0xd8, 0xff, 9, 9, 9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]);
const project = () => makeProject(makeTempDir()).root;
const storeDir = (root: string) => join(root, "design", ".spool", "thumbs", "home");

describe("writing a cover", () => {
	it("writes one immutable image addressed by its content hash", () => {
		const root = project();
		const cover = writeCover(root, "home", JPEG);
		expect(cover.hash).toMatch(/^[0-9a-f]{32}$/);
		expect(readdirSync(storeDir(root)).sort()).toEqual([`${cover.hash}.jpg`, "booth"]);
		expect(readCover(root, "home")).toEqual(cover);
		expect(readCoverImage(root, "home", cover.hash)).toMatchObject({ type: "image/jpeg", bytes: JPEG });
	});

	it("changes the address for changed content and retires the previous image", () => {
		const root = project();
		const first = writeCover(root, "home", JPEG);
		const next = writeCover(root, "home", OTHER_JPEG);
		expect(next.hash).not.toBe(first.hash);
		expect(readdirSync(storeDir(root)).sort()).toEqual([`${next.hash}.jpg`, "booth"]);
	});

	it("keeps the address for identical content", () => {
		const root = project();
		expect(writeCover(root, "home", JPEG)).toEqual(writeCover(root, "home", JPEG));
	});

	it("treats an existing ladder as absent", () => {
		const root = project();
		mkdirSync(storeDir(root), { recursive: true });
		writeFileSync(join(storeDir(root), `${"a".repeat(32)}.780.jpg`), JPEG);
		writeFileSync(join(storeDir(root), `${"a".repeat(32)}.390.jpg`), JPEG);
		expect(readCover(root, "home")).toBeUndefined();
		expect(scanCovers(root)).toEqual(new Map());
	});

	it("keeps a PNG image's own encoding", () => {
		const root = project();
		const cover = writeCover(root, "home", PNG);
		expect(existsSync(join(storeDir(root), `${cover.hash}.png`))).toBe(true);
	});

	it("scans every covered frame, and reads one off the event loop", async () => {
		const root = project();
		const home = writeCover(root, "home", JPEG);
		const cart = writeCover(root, "cart", PNG);
		expect(scanCovers(root)).toEqual(
			new Map([
				["cart", cart],
				["home", home],
			]),
		);
		expect(await readCoverAwaited(root, "home")).toEqual(home);
	});

	it("reads no cover for a frame whose folder holds no readable cover", async () => {
		const root = project();
		mkdirSync(storeDir(root), { recursive: true });
		writeFileSync(join(storeDir(root), `${"a".repeat(32)}.780.jpg`), JPEG);
		expect(await readCoverAwaited(root, "home")).toBeUndefined();
		expect(await readCoverAwaited(root, "nobody")).toBeUndefined();
	});

	it("answers only the exact immutable address", () => {
		const root = project();
		const cover = writeCover(root, "home", JPEG);
		expect(readCoverImage(root, "home", cover.hash)?.bytes).toEqual(JPEG);
		expect(readCoverImage(root, "home", "0".repeat(32))).toBeUndefined();
	});

	it("chooses deterministically when an interrupted write leaves two images", () => {
		const root = project();
		mkdirSync(storeDir(root), { recursive: true });
		writeFileSync(join(storeDir(root), `${"a".repeat(32)}.jpg`), JPEG);
		writeFileSync(join(storeDir(root), `${"f".repeat(32)}.png`), PNG);
		expect(readCover(root, "home")).toEqual({ hash: "f".repeat(32) });
	});

	it("refuses bytes the store cannot serve", () => {
		expect(() => writeCover(project(), "home", Buffer.from("nope"))).toThrow("a cover must be one PNG or JPEG image");
	});
});

describe("recording a capture failure (#173)", () => {
	it("round-trips a reason and when it happened", () => {
		const root = project();
		expect(readCaptureError(root, "home")).toBeUndefined();

		writeCaptureError(root, "home", "capture canvases too large");

		const recorded = readCaptureError(root, "home");
		expect(recorded?.error).toBe("capture canvases too large");
		expect(recorded?.at).toEqual(expect.any(String));
		expect(new Date(recorded?.at ?? "").toString()).not.toBe("Invalid Date");
	});

	it("reads malformed or absent records as no recorded error", () => {
		const root = project();
		expect(readCaptureError(root, "home")).toBeUndefined();

		mkdirSync(storeDir(root), { recursive: true });
		writeFileSync(join(storeDir(root), "error.json"), "{ not json");
		expect(readCaptureError(root, "home")).toBeUndefined();

		writeFileSync(join(storeDir(root), "error.json"), JSON.stringify({ error: "missing the at field" }));
		expect(readCaptureError(root, "home")).toBeUndefined();

		writeFileSync(join(storeDir(root), "error.json"), JSON.stringify([]));
		expect(readCaptureError(root, "home")).toBeUndefined();
	});

	it("clears a recorded error the moment a landed cover retires every other file", () => {
		const root = project();
		writeCaptureError(root, "home", "capture reply timed out");
		expect(readCaptureError(root, "home")).toBeDefined();

		writeCover(root, "home", JPEG);

		expect(readCaptureError(root, "home")).toBeUndefined();
	});

	it("never confuses its own record with a cover", () => {
		const root = project();
		writeCaptureError(root, "home", "capture source too large");

		expect(readCover(root, "home")).toBeUndefined();
		expect(scanCovers(root)).toEqual(new Map());
	});
});

describe("the colour scheme a cover was taken in", () => {
	it("is written beside a cover that follows one, and retires with it", async () => {
		const root = project();
		writeCover(root, "night", JPEG, "dark");
		writeCover(root, "plain", PNG);
		expect(await scanCoverSchemes(root)).toEqual(new Map([["night", "dark"]]));
		// a later picture that follows no scheme takes the record with it
		writeCover(root, "night", OTHER_JPEG);
		expect(await scanCoverSchemes(root)).toEqual(new Map());
	});

	it("is never mistaken for a cover", () => {
		const root = project();
		const cover = writeCover(root, "home", JPEG, "light");
		expect(readCover(root, "home")).toEqual(cover);
		expect(scanCovers(root)).toEqual(new Map([["home", cover]]));
	});
});

describe("covers taken before the booth", () => {
	it("are every stored cover the booth did not write", async () => {
		const root = project();
		writeCover(root, "booth-made", JPEG);
		// a canvas photograph from before the booth: the image alone
		mkdirSync(storeDir(root), { recursive: true });
		writeFileSync(join(storeDir(root), `${"a".repeat(32)}.jpg`), JPEG);
		expect(await scanPreBoothCovers(root)).toEqual(["home"]);

		// the booth's own picture of it ends that
		writeCover(root, "home", OTHER_JPEG);
		expect(await scanPreBoothCovers(root)).toEqual([]);
		expect(scanCovers(root).size).toBe(2);
	});

	it("leave out a frame the booth already failed on, which would only fail again", async () => {
		const root = project();
		mkdirSync(storeDir(root), { recursive: true });
		writeFileSync(join(storeDir(root), `${"a".repeat(32)}.jpg`), JPEG);
		writeFileSync(
			join(storeDir(root), "error.json"),
			JSON.stringify({ error: "too slow", at: "2026-10-03T00:00:00Z" }),
		);
		expect(await scanPreBoothCovers(root)).toEqual([]);
	});
});

describe("a cover's own size", () => {
	it("reads a stored JPEG's frame header", async () => {
		const root = project();
		// SOI, an APP0 segment to step over, then a baseline frame header: 1731 high, 800 wide
		const jpeg = Buffer.from([
			0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x06, 0xc3, 0x03, 0x20, 0x03,
		]);
		writeCover(root, "home", jpeg);
		expect(await coverSize(root, "home")).toEqual({ width: 800, height: 1731 });
	});

	it("reads a PNG's header", () => {
		const png = Buffer.alloc(24);
		png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		png.writeUInt32BE(800, 16);
		png.writeUInt32BE(500, 20);
		expect(imageSize(png)).toEqual({ width: 800, height: 500 });
	});

	it("knows nothing of a frame with no cover, or bytes it cannot read", async () => {
		const root = project();
		expect(await coverSize(root, "home")).toBeUndefined();
		expect(imageSize(JPEG)).toBeUndefined();
	});
});

describe("how fast a frame redrew when it was timed", () => {
	it("round-trips beside the cover, and outlives a later picture of the same source", () => {
		const root = project();
		writeCover(root, "home", JPEG);
		writePace(root, "home", { perSecond: 8, slowestMs: 139, scale: 2 });
		expect(scanPaces(root)).toEqual(
			new Map([["home", { perSecond: 8, slowestMs: 139, scale: 2, timedAt: expect.any(Number) }]]),
		);

		// a picture retaken for a scheme is of the same source the timing was
		writeCover(root, "home", OTHER_JPEG, "dark");
		expect(scanPaces(root).get("home")?.perSecond).toBe(8);
		expect(readCover(root, "home")).toBeDefined();
	});

	it("is forgotten when a frame could not be timed again", () => {
		const root = project();
		writePace(root, "home", { perSecond: 8, slowestMs: 139, scale: 2 });
		writePace(root, "home", undefined);
		expect(scanPaces(root)).toEqual(new Map());
	});

	it("reads a malformed record as untimed", () => {
		const root = project();
		mkdirSync(storeDir(root), { recursive: true });
		writeFileSync(join(storeDir(root), "pace.json"), "{ not json");
		expect(scanPaces(root)).toEqual(new Map());
		writeFileSync(join(storeDir(root), "pace.json"), JSON.stringify({ perSecond: "8" }));
		expect(scanPaces(root)).toEqual(new Map());
	});
});
