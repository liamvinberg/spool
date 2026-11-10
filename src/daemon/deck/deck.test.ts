import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { DeckChange, DeckChangeAnswer, DecksRead } from "../../deck/wire";
import { makeApp, makeProject, makeTempDir, sseReader, writeDesignFile, writePageFrame } from "../../test-helpers";
import { reconcileDeck } from "./change";

/**
 * The deck on disk over a fixture design/ (spool#265): what the daemon writes for a deck, when, and what it never
 * writes. The rules themselves are proven as functions beside the model; these prove the daemon applies them to files.
 */

const tsx = (label: string) => `export default function Frame() {\n\treturn <p>${label}</p>;\n}\n`;
const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
const box = (x: number, y: number, w = 1280, h = 720) => ({ x, y, w, h });
const QUIET = 900;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deckProject(options: { on?: boolean } = {}) {
	const spoolDir = join(makeTempDir(), ".spool");
	mkdirSync(spoolDir, { recursive: true });
	if (options.on !== false)
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experimental: { deck: true } }));
	const { root, name } = makeProject(spoolDir);
	const trashDir = makeTempDir();
	const trashed: { from: string; to: string }[] = [];
	const page = join(root, "design", "frames", "talk");
	const app = makeApp(spoolDir, {
		moveToTrash: async (paths) => {
			for (const path of paths) {
				const to = join(trashDir, `${trashed.length}`);
				renameSync(path, to);
				trashed.push({ from: path, to });
			}
		},
	});
	const sidecar = (folder: string) => {
		const file = join(page, folder, "frame.json");
		return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
	};
	const change = async (body: DeckChange) => {
		const res = await app.request(`/api/p/${name}/deck`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		return { status: res.status, answer: res.status === 200 ? ((await res.json()) as DeckChangeAnswer) : undefined };
	};
	/** every file of the page but the frames' source, as bytes by path */
	const files = () => {
		const found: Record<string, string> = {};
		for (const entry of readdirSync(page, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || entry.name === "frame.tsx") continue;
			const path = join(entry.parentPath, entry.name);
			found[relative(page, path)] = readFileSync(path, "utf8");
		}
		return found;
	};
	const post = (path: string, body: unknown) =>
		app.request(`/api/p/${name}/${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	return { spoolDir, root, name, app, page, sidecar, change, files, post, trashed };
}

describe("a deck on disk", () => {
	it("lays out a deck written from outside, then writes nothing more, and nothing for files it cannot read", async () => {
		const deck = deckProject();
		writePageFrame(deck.root, "talk", "title", tsx("title"));
		writePageFrame(deck.root, "talk", "sense", tsx("sense"));
		writePageFrame(deck.root, "talk", "draft", tsx("draft"));
		writeDesignFile(deck.root, "frames/talk/draft/frame.json", json(box(5000, 0, 800, 600)));
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 1, slides: ["sense", "title"] }));

		await vi.waitFor(() => expect(deck.sidecar("draft")).toEqual(box(4560, 1420, 800, 600)), { timeout: 5_000 });
		expect(deck.sidecar("sense")).toEqual(box(0, 0));
		expect(deck.sidecar("title")).toEqual(box(1440, 0));

		// laid out, it is a fixed point: its own writes came back as changes and wrote nothing
		expect(reconcileDeck(deck.root, "talk")).toEqual([]);
		const settled = deck.files();
		const mtimes = Object.keys(settled).map((path) => statSync(join(deck.page, path)).mtimeMs);
		await wait(QUIET);
		expect(Object.keys(settled).map((path) => statSync(join(deck.page, path)).mtimeMs)).toEqual(mtimes);

		// a version this spool does not know, or bytes caught mid-write, change nothing
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 2, slides: ["title", "sense"] }));
		await wait(QUIET);
		expect(deck.sidecar("title")).toEqual(box(1440, 0));
		writeDesignFile(deck.root, "frames/talk/deck.json", '{ "version": 1, "slides": ["title", ');
		await wait(QUIET);
		expect(deck.sidecar("title")).toEqual(box(1440, 0));
		expect((await deck.change({ kind: "reorder", page: "talk", frame: "title", to: 0 })).status).toBe(409);

		// nor does a page where a sidecar is half written, until it is whole
		writeDesignFile(deck.root, "frames/talk/draft/frame.json", '{ "x": 1');
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 1, slides: ["title", "sense"] }));
		await wait(QUIET);
		expect(deck.sidecar("title")).toEqual(box(1440, 0));
		writeDesignFile(deck.root, "frames/talk/draft/frame.json", json({ w: 800, h: 600 }));
		await vi.waitFor(() => expect(deck.sidecar("title")).toEqual(box(0, 0)), { timeout: 5_000 });
		expect(deck.sidecar("sense")).toEqual(box(1440, 0));
		expect(deck.sidecar("draft")).toEqual(box(240, 1420, 800, 600));
	});

	it("brings two machines to the same bytes, and to rest, whichever of their writes sync kept", async () => {
		const one = deckProject();
		const other = deckProject();
		const frames = (root: string) => {
			for (const folder of ["a", "b", "c", "d"]) writePageFrame(root, "talk", folder, tsx(folder));
			writeDesignFile(root, "frames/talk/d/frame.json", json({ w: 390, h: 844 }));
		};
		const deckFile = (root: string) =>
			writeDesignFile(
				root,
				"frames/talk/deck.json",
				json({ version: 1, w: 1920, h: 1080, slides: ["c", "a", "d"] }),
			);
		writePageFrame(one.root, "talk", "seed", tsx("seed"));
		writePageFrame(other.root, "talk", "seed", tsx("seed"));
		// each hears the same files in another order, so each lays them out its own way first
		deckFile(one.root);
		frames(other.root);
		await wait(QUIET);
		frames(one.root);
		deckFile(other.root);
		const laid = (deck: ReturnType<typeof deckProject>) =>
			vi.waitFor(() => expect(deck.sidecar("a")).toEqual(box(2080, 0, 1920, 1080)), { timeout: 5_000 });
		await Promise.all([laid(one), laid(other)]);
		await wait(QUIET);
		// sync keeps one machine's write of each file, each file its own way, and both get what it kept
		const mine = one.files();
		const theirs = other.files();
		const kept = Object.keys(mine)
			.sort()
			.map((path, at) => [path, at % 2 === 0 ? mine[path] : theirs[path]] as const);
		for (const [path, bytes] of kept) {
			for (const deck of [one, other]) {
				if (bytes !== undefined && deck.files()[path] !== bytes)
					writeDesignFile(deck.root, `frames/talk/${path}`, bytes);
			}
		}
		await vi.waitFor(() => expect(one.files()).toEqual(other.files()), { timeout: 5_000 });
		// and then neither writes again
		const settled = one.files();
		await wait(QUIET * 2);
		expect(one.files()).toEqual(settled);
		expect(other.files()).toEqual(settled);
		expect(reconcileDeck(one.root, "talk")).toEqual([]);
		expect(reconcileDeck(other.root, "talk")).toEqual([]);
	});

	it("applies each change whole, and its undo puts back the exact bytes, notes included", async () => {
		const deck = deckProject();
		for (const folder of ["intro", "body", "end", "alt", "spare"])
			writePageFrame(deck.root, "talk", folder, tsx(folder));
		writeDesignFile(deck.root, "frames/talk/spare/frame.json", json(box(-3000, 9000, 600, 400)));
		writeDesignFile(deck.root, "frames/talk/body/notes.md", "Say hello.\n\nThen the numbers.\n");
		writeDesignFile(deck.root, "frames/talk/alt/notes.md", "The other take.\n");
		const ordinary = deck.files();

		const made = await deck.change({ kind: "make", page: "talk", slides: ["intro", "body", "end"] });
		expect(made.status).toBe(200);
		expect(made.answer?.deck?.slides.map((slide) => slide.name)).toEqual(["talk/intro", "talk/body", "talk/end"]);
		expect((await deck.change({ kind: "make", page: "talk" })).status).toBe(409);
		// making the deck undoes to the ordinary page it was, and redoes to the deck
		const madeFiles = deck.files();
		expect((await deck.change(made.answer?.undo as DeckChange)).status).toBe(200);
		expect(deck.files()).toEqual(ordinary);
		await deck.change(made.answer?.redo as DeckChange);
		expect(deck.files()).toEqual(madeFiles);

		const changes: DeckChange[] = [
			{ kind: "trade", page: "talk", frame: "alt", slide: "body" },
			{ kind: "insert", page: "talk", frames: ["spare", "alt"], at: 1 },
			{ kind: "place", page: "talk", frames: ["end"], cell: { col: 0, row: 1 } },
			{ kind: "reorder", page: "talk", frame: "alt", to: 0 },
			{ kind: "arrange", page: "talk", slides: ["end", "spare"] },
			{ kind: "size", page: "talk", size: { w: 1920, h: 1080 } },
		];
		for (const body of changes) {
			const before = deck.files();
			const done = await deck.change(body);
			expect([body.kind, done.status]).toEqual([body.kind, 200]);
			expect(done.answer?.changed).toBe(true);
			const after = deck.files();
			expect(after).not.toEqual(before);
			const undone = await deck.change(done.answer?.undo as DeckChange);
			expect(undone.status).toBe(200);
			expect(deck.files()).toEqual(before);
			await deck.change(done.answer?.redo as DeckChange);
			expect(deck.files()).toEqual(after);
		}

		// the trade took the notes with the place, and nothing of either was lost on the way back and forth
		const fresh = deckProject();
		for (const folder of ["one", "two", "loose"]) writePageFrame(fresh.root, "talk", folder, tsx(folder));
		writeDesignFile(fresh.root, "frames/talk/one/notes.md", "One's words.\n");
		await fresh.change({ kind: "make", page: "talk", slides: ["one", "two"] });
		const traded = await fresh.change({ kind: "trade", page: "talk", frame: "loose", slide: "one" });
		expect(fresh.files()["loose/notes.md"]).toBe("One's words.\n");
		expect(fresh.files()["one/notes.md"]).toBeUndefined();
		await fresh.change(traded.answer?.undo as DeckChange);
		expect(fresh.files()["one/notes.md"]).toBe("One's words.\n");
		expect(fresh.files()["loose/notes.md"]).toBeUndefined();
	});

	it("keeps the talk in step through rename, move, trash, restore and duplicate", async () => {
		const deck = deckProject();
		for (const folder of ["a", "b", "c", "d"]) writePageFrame(deck.root, "talk", folder, tsx(folder));
		await deck.change({ kind: "make", page: "talk", slides: ["a", "b", "c", "d"] });
		const talk = () => JSON.parse(readFileSync(join(deck.page, "deck.json"), "utf8")).slides;

		expect((await deck.post("frames/rename", { from: "talk/b", to: "talk/story" })).status).toBe(204);
		expect(talk()).toEqual(["a", "story", "c", "d"]);
		expect((await deck.post("frames/move", { frames: ["talk/c"], page: "" })).status).toBe(204);
		expect(talk()).toEqual(["a", "story", "d"]);
		expect((await deck.post("trash", { frames: ["talk/a"] })).status).toBe(204);
		expect(talk()).toEqual(["story", "d"]);
		await vi.waitFor(() => expect(deck.sidecar("story")).toEqual(box(0, 0)), { timeout: 5_000 });

		// put back from the Trash, it comes back loose, under the band
		const gone = deck.trashed[0] as { from: string; to: string };
		renameSync(gone.to, gone.from);
		await vi.waitFor(() => expect(deck.sidecar("a")).toEqual(box(0, 1360)), { timeout: 5_000 });
		expect(talk()).toEqual(["story", "d"]);

		// a copy is loose too, in the free cell nearest its original
		const copied = await deck.post("frames/duplicate", { frames: ["talk/d"] });
		expect(copied.status).toBe(200);
		await vi.waitFor(() => expect(deck.sidecar("d-copy")).toEqual(box(1440, 1360)), { timeout: 5_000 });
		expect(talk()).toEqual(["story", "d"]);

		// a page copied carries its deck
		expect((await deck.post("pages/duplicate", { name: "talk" })).status).toBe(200);
		expect(JSON.parse(readFileSync(join(deck.root, "design/frames/talk-copy/deck.json"), "utf8")).slides).toEqual([
			"story",
			"d",
		]);
	});

	it("reads every deck, says what is wrong with one, and tells the window a deck changed", async () => {
		const deck = deckProject();
		for (const folder of ["a", "b", "loose"]) writePageFrame(deck.root, "talk", folder, tsx(folder));
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ slides: ["b", "ghost", "a", "b"] }));
		writePageFrame(deck.root, "later", "x", tsx("x"));
		writeDesignFile(deck.root, "frames/later/deck.json", json({ version: 9, slides: ["x"] }));

		const read = (await (await deck.app.request(`/api/p/${deck.name}/decks`)).json()) as DecksRead;
		expect(read).toEqual({
			decks: [
				{
					page: "talk",
					size: { w: 1280, h: 720 },
					slides: [{ name: "talk/b" }, { name: "talk/a" }],
					loose: [{ name: "talk/loose", cell: { col: 0, row: 1 } }],
					problems: [
						{ kind: "missing", name: "talk/ghost" },
						{ kind: "repeated", name: "talk/b" },
					],
				},
			],
			unread: [{ page: "later", why: "version" }],
		});
		// the read laid the deck out first, and left the other version's page as it was
		expect(deck.sidecar("b")).toEqual(box(0, 0));
		expect(existsSync(join(deck.root, "design/frames/later/x/frame.json"))).toBe(false);

		// a frame born on the deck's page is placed where the deck keeps it, at the talk's size
		writePageFrame(deck.root, "talk", "new", tsx("new"));
		const frames = (await (await deck.app.request(`/api/p/${deck.name}/frames`)).json()) as {
			frames: { name: string; x: number; y: number; w: number; h: number }[];
		};
		expect(frames.frames.find((frame) => frame.name === "talk/new")).toMatchObject(box(1440, 1360));

		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await deck.app.request(`/api/p/${deck.name}/events`, { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");
		writeDesignFile(deck.root, "frames/talk/a/notes.md", "Words.\n");
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 1, slides: ["a", "b"] }));
		const seen: unknown[] = [];
		await vi.waitFor(
			async () => {
				seen.push((await events.next(2_000)).data);
				expect(seen).toContainEqual({ kind: "deck", page: "talk" });
			},
			{ timeout: 5_000 },
		);
		// not as a frame named after the file
		expect(seen).not.toContainEqual({ kind: "frame", frame: "talk/deck.json" });
	});

	it("answers nothing and writes nothing with the experiment off", async () => {
		const deck = deckProject({ on: false });
		writePageFrame(deck.root, "talk", "a", tsx("a"));
		writePageFrame(deck.root, "talk", "b", tsx("b"));
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 1, slides: ["b", "a"] }));
		await wait(QUIET);
		expect(deck.sidecar("a")).toBeUndefined();
		expect((await deck.app.request(`/api/p/${deck.name}/decks`)).status).toBe(404);
		expect((await deck.change({ kind: "make", page: "talk" })).status).toBe(404);
		expect((await deck.post("frames/rename", { from: "talk/a", to: "talk/c" })).status).toBe(204);
		expect(JSON.parse(readFileSync(join(deck.page, "deck.json"), "utf8")).slides).toEqual(["b", "a"]);
		// a frame on the page is placed as on any page, beside the others
		const frames = (await (await deck.app.request(`/api/p/${deck.name}/frames`)).json()) as {
			frames: { name: string; w: number }[];
		};
		expect(frames.frames.map((frame) => frame.w)).toEqual([1440, 1440]);
	});
});
