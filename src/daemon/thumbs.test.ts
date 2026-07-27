import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeProject, makeTempDir } from "../test-helpers";
import {
	coverModified,
	createThumbHealer,
	readCover,
	readCoverRung,
	scanCovers,
	UnservableCoverError,
	writeCover,
} from "./thumbs";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
const OTHER_JPEG = Buffer.from([0xff, 0xd8, 0xff, 9, 9, 9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]);

function project(): string {
	return makeProject(makeTempDir()).root;
}

function storeDir(root: string, frame: string): string {
	return join(root, "design", ".spool", "thumbs", frame);
}

const ladder = (bytes = JPEG) => [
	{ width: 780, bytes },
	{ width: 390, bytes: Buffer.concat([bytes, Buffer.from([4])]) },
	{ width: 195, bytes: Buffer.concat([bytes, Buffer.from([5])]) },
];

describe("writing a cover ladder", () => {
	it("answers with the hash that addresses it and its rungs, widest first", () => {
		const root = project();
		const cover = writeCover(root, "home", ladder());
		expect(cover.hash).toMatch(/^[0-9a-f]{32}$/);
		expect(cover.widths).toEqual([780, 390, 195]);
	});

	it("names one file per rung, hash then width", () => {
		const root = project();
		const cover = writeCover(root, "home", ladder());
		expect(readdirSync(storeDir(root, "home")).sort()).toEqual(
			[`${cover.hash}.195.jpg`, `${cover.hash}.390.jpg`, `${cover.hash}.780.jpg`].sort(),
		);
	});

	it("takes the rungs in any order and still reports them widest first", () => {
		const root = project();
		const cover = writeCover(root, "home", [...ladder()].reverse());
		expect(cover.widths).toEqual([780, 390, 195]);
	});

	it("hashes the content, so the same picture keeps its address and a new one gets its own", () => {
		const root = project();
		const first = writeCover(root, "home", ladder());
		expect(writeCover(root, "home", ladder()).hash).toBe(first.hash);
		expect(writeCover(root, "home", ladder(OTHER_JPEG)).hash).not.toBe(first.hash);
	});

	it("hashes the declared widths too — the same bytes at another size are another cover", () => {
		const root = project();
		const one = writeCover(root, "home", [{ width: 780, bytes: JPEG }]);
		const two = writeCover(root, "home", [{ width: 390, bytes: JPEG }]);
		expect(two.hash).not.toBe(one.hash);
	});

	it("retires the ladder it replaces — one cover per frame", () => {
		const root = project();
		const stale = writeCover(root, "home", ladder());
		const fresh = writeCover(root, "home", ladder(OTHER_JPEG));
		const files = readdirSync(storeDir(root, "home"));
		expect(files.every((file) => file.startsWith(fresh.hash))).toBe(true);
		expect(files.some((file) => file.startsWith(stale.hash))).toBe(false);
	});

	it("sweeps the bare file the old store left beside it", () => {
		const root = project();
		const thumbs = join(root, "design", ".spool", "thumbs");
		mkdirSync(thumbs, { recursive: true });
		writeFileSync(join(thumbs, "home.jpg"), JPEG);
		writeFileSync(join(thumbs, "home.png"), PNG);
		writeCover(root, "home", ladder());
		expect(existsSync(join(thumbs, "home.jpg"))).toBe(false);
		expect(existsSync(join(thumbs, "home.png"))).toBe(false);
	});

	it("keeps a rung's own encoding in its name", () => {
		const root = project();
		const cover = writeCover(root, "home", [{ width: 195, bytes: PNG }]);
		expect(existsSync(join(storeDir(root, "home"), `${cover.hash}.195.png`))).toBe(true);
	});

	it("refuses bytes that are not a cover this store can serve", () => {
		const root = project();
		expect(() => writeCover(root, "home", [{ width: 195, bytes: Buffer.from("nope") }])).toThrow(
			UnservableCoverError,
		);
	});

	it("refuses a ladder with no rungs", () => {
		expect(() => writeCover(project(), "home", [])).toThrow();
	});
});

describe("reading a cover back", () => {
	it("finds the frame's ladder", () => {
		const root = project();
		const written = writeCover(root, "home", ladder());
		expect(readCover(root, "home")).toEqual(written);
		expect(scanCovers(root).get("home")).toEqual(written);
	});

	it("sees a one-rung ladder as a normal cover — a heal writes exactly that", () => {
		const root = project();
		const written = writeCover(root, "home", [{ width: 195, bytes: JPEG }]);
		expect(readCover(root, "home")).toEqual({ hash: written.hash, widths: [195] });
	});

	it("does not see a bare unhashed file as a cover at all", () => {
		const root = project();
		const thumbs = join(root, "design", ".spool", "thumbs");
		mkdirSync(thumbs, { recursive: true });
		writeFileSync(join(thumbs, "home.jpg"), JPEG);
		expect(readCover(root, "home")).toBeUndefined();
		expect(scanCovers(root).size).toBe(0);
	});

	it("prefers the longer ladder when a crashed write left two, whatever their hashes", () => {
		const root = project();
		const dir = storeDir(root, "home");
		mkdirSync(dir, { recursive: true });
		// a stale one-rung ladder whose hash sorts after a fresh three-rung one:
		// length decides, so readdir order cannot make two readers disagree
		writeFileSync(join(dir, `${"f".repeat(32)}.195.jpg`), JPEG);
		for (const width of [780, 390, 195]) writeFileSync(join(dir, `${"a".repeat(32)}.${width}.jpg`), JPEG);

		expect(readCover(root, "home")).toEqual({ hash: "a".repeat(32), widths: [780, 390, 195] });
	});

	it("breaks a true tie by hash, so every reader picks the same ladder", () => {
		const root = project();
		const dir = storeDir(root, "home");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${"a".repeat(32)}.195.jpg`), JPEG);
		writeFileSync(join(dir, `${"f".repeat(32)}.195.jpg`), JPEG);

		expect(readCover(root, "home")?.hash).toBe("f".repeat(32));
	});

	it("has nothing to say about a frame with no cover, or a store with no folder", () => {
		const root = project();
		expect(readCover(root, "home")).toBeUndefined();
		expect(scanCovers(root)).toEqual(new Map());
		expect(coverModified(root, "home")).toBeUndefined();
	});

	it("sweeps every frame's ladder in one pass", () => {
		const root = project();
		const home = writeCover(root, "home", ladder());
		const cart = writeCover(root, "cart", [{ width: 195, bytes: PNG }]);
		expect(scanCovers(root)).toEqual(
			new Map([
				["cart", cart],
				["home", home],
			]),
		);
	});

	it("dates a cover, so the home card can show the freshest three", () => {
		const root = project();
		writeCover(root, "home", ladder());
		expect(coverModified(root, "home")).toBeTypeOf("number");
	});
});

describe("reading one rung", () => {
	it("serves the rung the address names, with its media type", () => {
		const root = project();
		const cover = writeCover(root, "home", ladder());
		const rung = readCoverRung(root, "home", cover.hash, 390);
		expect(rung?.type).toBe("image/jpeg");
		expect(rung?.bytes.equals(ladder()[1]?.bytes as Buffer)).toBe(true);
	});

	it("has nothing for a hash or a width the frame never wrote", () => {
		const root = project();
		const cover = writeCover(root, "home", ladder());
		expect(readCoverRung(root, "home", cover.hash, 1000)).toBeUndefined();
		expect(readCoverRung(root, "home", "0".repeat(32), 390)).toBeUndefined();
	});
});

describe("the headless fallback", () => {
	const heal = (root: string) => ({
		root,
		frame: "home",
		url: "http://localhost/frames/home",
		width: 390,
		height: 844,
	});

	it("writes the one rung it can make, and says so", async () => {
		const root = project();
		const stored: { frame: string; widths: number[] }[] = [];
		const healer = createThumbHealer({
			capture: async () => JPEG,
			stored: (_root, frame, cover) => stored.push({ frame, widths: cover.widths }),
		});

		healer.request(heal(root));
		await vi.waitFor(() => expect(stored).toHaveLength(1));
		// the bottom rung of the ladder a self-capture would write: no image library
		// here, so one device scale is all a shot can be
		expect(stored[0]).toEqual({ frame: "home", widths: [195] });
		expect(readCover(root, "home")?.widths).toEqual([195]);
	});

	it("never replaces a cover that arrived while it was shooting", async () => {
		const root = project();
		const stored: string[] = [];
		let shooting: (() => void) | undefined;
		const healer = createThumbHealer({
			capture: () =>
				new Promise((done) => {
					shooting = () => done(JPEG);
				}),
			stored: (_root, frame) => stored.push(frame),
		});

		healer.request(heal(root));
		await vi.waitFor(() => expect(shooting).toBeTypeOf("function"));
		// the frame mounted and photographed itself mid-shot: a whole ladder must
		// not lose to the one rung a fallback can make
		const arrived = writeCover(root, "home", ladder());
		shooting?.();
		await vi.waitFor(() => expect(readCover(root, "home")).toEqual(arrived));
		expect(stored).toEqual([]);
	});

	it("spends no shot on a frame that is already covered, whatever address was asked for", async () => {
		const root = project();
		writeCover(root, "home", ladder());
		let shots = 0;
		const healer = createThumbHealer({
			capture: async () => {
				shots += 1;
				return JPEG;
			},
			stored: () => {},
		});

		healer.request(heal(root));
		// a browser launch and a frame boot are the cost of a shot: a made-up
		// address must not be able to buy one
		await new Promise((settle) => setTimeout(settle, 20));
		expect(shots).toBe(0);
	});

	it("shoots a frame once per cooldown, however often it is asked", async () => {
		const root = project();
		let shots = 0;
		const healer = createThumbHealer({
			capture: async () => {
				shots += 1;
				return undefined;
			},
			stored: () => {},
		});

		healer.request(heal(root));
		healer.request(heal(root));
		healer.request(heal(root));
		await vi.waitFor(() => expect(shots).toBe(1));
	});
});
