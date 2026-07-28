import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeProject, makeTempDir } from "../test-helpers";
import {
	coverModified,
	createThumbHealer,
	readCover,
	readCoverImage,
	scanCovers,
	UnservableCoverError,
	writeCover,
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
		expect(readdirSync(storeDir(root))).toEqual([`${cover.hash}.jpg`]);
		expect(readCover(root, "home")).toEqual(cover);
		expect(readCoverImage(root, "home", cover.hash)).toMatchObject({ type: "image/jpeg", bytes: JPEG });
	});

	it("changes the address for changed content and retires the previous image", () => {
		const root = project();
		const first = writeCover(root, "home", JPEG);
		const next = writeCover(root, "home", OTHER_JPEG);
		expect(next.hash).not.toBe(first.hash);
		expect(readdirSync(storeDir(root))).toEqual([`${next.hash}.jpg`]);
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

	it("scans every covered frame and exposes its freshness", () => {
		const root = project();
		const home = writeCover(root, "home", JPEG);
		const cart = writeCover(root, "cart", PNG);
		expect(scanCovers(root)).toEqual(
			new Map([
				["cart", cart],
				["home", home],
			]),
		);
		expect(coverModified(root, "home")).toBeTypeOf("number");
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
		expect(() => writeCover(project(), "home", Buffer.from("nope"))).toThrow(UnservableCoverError);
	});
});

describe("the headless fallback", () => {
	it("writes the same one-image shape", async () => {
		const root = project();
		const stored = vi.fn();
		const healer = createThumbHealer({ capture: async () => JPEG, stored });
		healer.request({ root, frame: "home", url: "http://localhost/frames/home", width: 390, height: 844 });
		await vi.waitFor(() => expect(stored).toHaveBeenCalledOnce());
		expect(readCover(root, "home")).toEqual(stored.mock.calls[0]?.[2]);
	});

	it("does not overwrite a self-capture that lands during its shot", async () => {
		const root = project();
		let finish: (() => void) | undefined;
		const stored = vi.fn();
		const healer = createThumbHealer({
			capture: () =>
				new Promise((resolve) => {
					finish = () => resolve(JPEG);
				}),
			stored,
		});
		healer.request({ root, frame: "home", url: "http://localhost/frames/home", width: 390, height: 844 });
		await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
		const selfCapture = writeCover(root, "home", OTHER_JPEG);
		finish?.();
		await vi.waitFor(() => expect(readCover(root, "home")).toEqual(selfCapture));
		expect(stored).not.toHaveBeenCalled();
	});

	it("does not spend a shot for an already covered frame", async () => {
		const root = project();
		writeCover(root, "home", JPEG);
		const capture = vi.fn(async () => JPEG);
		const healer = createThumbHealer({ capture, stored: vi.fn() });
		healer.request({ root, frame: "home", url: "http://localhost/frames/home", width: 390, height: 844 });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(capture).not.toHaveBeenCalled();
	});

	it("deduplicates requests for one frame during the cooldown", async () => {
		const root = project();
		const capture = vi.fn(async () => undefined);
		const healer = createThumbHealer({ capture, stored: vi.fn() });
		const request = { root, frame: "home", url: "http://localhost/frames/home", width: 390, height: 844 };
		healer.request(request);
		healer.request(request);
		healer.request(request);
		await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
	});
});
