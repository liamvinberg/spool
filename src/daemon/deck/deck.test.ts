import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { DeckChange, DeckChangeAnswer, DecksRead } from "../../deck/wire";
import { switchExperiment } from "../../experiments-verb";
import { makeApp, makeProject, makeTempDir, sseReader, writeDesignFile, writePageFrame } from "../../test-helpers";
import { createSettingsStore } from "../settings";
import { reconcileDeck } from "./change";

/**
 * The deck on disk over a fixture design/ (spool#265): what the daemon writes for a deck, when, and what it never
 * writes. The rules themselves are proven as functions beside the model; these prove the daemon applies them to files.
 */

const tsx = (label: string) => `export default function Frame() {\n\treturn <p>${label}</p>;\n}\n`;
/** a slide naming its beats, written out or not, and maybe live */
const beatsTsx = (list: string, live = false) =>
	`import { ui as spool } from "spool";\nconst NAMES = ["one", "two"] as const;\nexport default function Slide() {\n\tconst beat = spool.beats(${list});\n${live ? "\tspool.live();\n" : ""}\treturn <p>{beat.name}</p>;\n}\n`;
const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
const box = (x: number, y: number, w = 1280, h = 720) => ({ x, y, w, h });
const QUIET = 900;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deckProject(options: { on?: boolean; before?: (root: string) => void } = {}) {
	const spoolDir = join(makeTempDir(), ".spool");
	mkdirSync(spoolDir, { recursive: true });
	if (options.on !== false)
		writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experimental: { deck: true } }));
	const { root, name } = makeProject(spoolDir);
	options.before?.(root);
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
	const decks = async () => (await (await app.request(`/api/p/${name}/decks`)).json()) as DecksRead;
	return { spoolDir, root, name, app, page, sidecar, change, files, post, trashed, decks };
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

		// a copy that is no longer whole, being removed, is never written into
		rmSync(join(deck.root, "design", "canvas.json"));
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 1, slides: ["sense", "title"] }));
		await wait(QUIET);
		expect(deck.sidecar("title")).toEqual(box(0, 0));
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
			// a change lands where reconcile would leave it, so nothing moves it after
			expect(reconcileDeck(deck.root, "talk")).toEqual([]);
			const undone = await deck.change(done.answer?.undo as DeckChange);
			expect(undone.status).toBe(200);
			expect(deck.files()).toEqual(before);
			expect(reconcileDeck(deck.root, "talk")).toEqual([]);
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
		const undo = traded.answer?.undo as DeckChange;
		await fresh.change(undo);
		expect(fresh.files()["one/notes.md"]).toBe("One's words.\n");
		expect(fresh.files()["loose/notes.md"]).toBeUndefined();
		// the same undo sent again finds the files it would put back already back, and trades nothing a second time
		expect((await fresh.change(undo)).status).toBe(409);
		expect(fresh.files()["one/notes.md"]).toBe("One's words.\n");

		// an undo or redo never writes over a hand's change since: to the talk, to notes, or a place in flight
		const redo = traded.answer?.redo as DeckChange;
		const untouched = fresh.files();
		writeDesignFile(fresh.root, "frames/talk/deck.json", json({ version: 1, slides: ["one", "two", "loose"] }));
		expect((await fresh.change(redo)).status).toBe(409);
		writeDesignFile(fresh.root, "frames/talk/deck.json", untouched["deck.json"] as string);
		writeDesignFile(fresh.root, "frames/talk/one/notes.md", "One's words, edited.\n");
		expect((await fresh.change(redo)).status).toBe(409);
		writeDesignFile(fresh.root, "frames/talk/one/notes.md", "One's words.\n");
		writeDesignFile(fresh.root, "frames/talk/loose/frame.json", '{ "x": ');
		expect((await fresh.change(redo)).status).toBe(409);
		writeDesignFile(fresh.root, "frames/talk/loose/frame.json", untouched["loose/frame.json"] as string);
		expect(fresh.files()).toEqual(untouched);
		// put back as it was, the redo lands
		expect((await fresh.change(redo)).status).toBe(200);
		expect(fresh.files()["loose/notes.md"]).toBe("One's words.\n");
	});

	it("makes New presentation's page whole in one change, its starter laid out with its beats and notes", async () => {
		const deck = deckProject();
		const made = await deck.change({ kind: "make", page: "talk", starter: true });
		expect(made.status).toBe(200);
		expect(made.answer?.made).toBe(true);
		const slides = made.answer?.deck?.slides ?? [];
		expect(slides.map((slide) => [slide.name, slide.beats, slide.live, slide.notes.length])).toEqual([
			["talk/title", [], false, 1],
			["talk/statement", [], false, 1],
			["talk/live", [], true, 1],
			["talk/number", ["number", "meaning"], false, 2],
			["talk/close", [], false, 1],
		]);
		expect(made.answer?.deck?.problems).toEqual([]);
		// every place is already where the deck keeps it, so nothing is written after the page lands
		expect(reconcileDeck(deck.root, "talk")).toEqual([]);
		expect(deck.sidecar("number")).toEqual(box(3 * 1440, 0));
		// put together out of sight, and nothing of that is left
		expect(readdirSync(join(deck.root, "design", ".spool", "deck-new"))).toEqual([]);

		// a page that is there already, or inside one that is not, is never made
		const files = deck.files();
		expect((await deck.change({ kind: "make", page: "talk", starter: true })).status).toBe(409);
		expect(deck.files()).toEqual(files);
		expect((await deck.change({ kind: "make", page: "nowhere/talk", starter: true })).status).toBe(404);
		expect(existsSync(join(deck.root, "design", "frames", "nowhere"))).toBe(false);
		// nor one whose page folder a link takes out of design/: nothing is written there
		const outside = makeTempDir();
		mkdirSync(join(outside, "nested"));
		symlinkSync(outside, join(deck.root, "design", "frames", "link"), "dir");
		expect((await deck.change({ kind: "make", page: "link/nested/talk", starter: true })).status).toBe(400);
		expect(readdirSync(join(outside, "nested"))).toEqual([]);
	});

	it("writes one beat's notes and undoes them to the exact bytes, with no frame reloaded or pictured for them", async () => {
		const deck = deckProject();
		writePageFrame(deck.root, "talk", "a", beatsTsx('["title", "price", "date"]'));
		writePageFrame(deck.root, "talk", "b", tsx("b"));
		await deck.change({ kind: "make", page: "talk", slides: ["a", "b"] });
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await deck.app.request(`/api/p/${deck.name}/events`, { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");
		// what making the deck wrote is heard first
		await events.drain(QUIET);
		const notes = () => deck.files()["a/notes.md"];

		// the file is made for the first words, a beat before them standing empty
		const first = await deck.change({ kind: "notes", page: "talk", frame: "a", beat: 1, text: "Then the price." });
		expect(notes()).toBe("-\n\nThen the price.\n");
		expect(first.answer?.deck?.slides[0]?.notes).toEqual(["", "Then the price.", ""]);
		const second = await deck.change({ kind: "notes", page: "talk", frame: "a", beat: 0, text: "Hold it up." });
		expect(notes()).toBe("Hold it up.\n\nThen the price.\n");
		// the same words again are no change, and no undo entry
		const same = await deck.change({ kind: "notes", page: "talk", frame: "a", beat: 0, text: "Hold it up." });
		expect(same.answer?.changed).toBe(false);
		expect((await deck.change({ kind: "notes", page: "talk", frame: "ghost", beat: 0, text: "x" })).status).toBe(404);

		// each undoes to the exact bytes, the first to no file at all, and redoes
		expect((await deck.change(second.answer?.undo as DeckChange)).status).toBe(200);
		expect(notes()).toBe("-\n\nThen the price.\n");
		expect((await deck.change(first.answer?.undo as DeckChange)).status).toBe(200);
		expect(notes()).toBeUndefined();
		await deck.change(first.answer?.redo as DeckChange);
		expect(notes()).toBe("-\n\nThen the price.\n");
		// the words emptied, the file goes
		await deck.change({ kind: "notes", page: "talk", frame: "a", beat: 1, text: "" });
		expect(notes()).toBeUndefined();
		// a loose frame's notes are written the same way, and a deck change of no kind spool knows is refused
		expect((await deck.change({ kind: "notes", page: "talk", frame: "b", beat: 0, text: "Spare." })).status).toBe(
			200,
		);

		// what the window heard: the deck, never the frame whose notes these are, so it neither reloads nor is shot again
		const heard: unknown[] = [];
		try {
			for (;;) heard.push((await events.next(QUIET)).data);
		} catch {
			// quiet
		}
		expect(heard).toContainEqual({ kind: "deck", page: "talk" });
		expect(heard.filter((event) => (event as { kind: string }).kind !== "deck")).toEqual([]);
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

		// an ordinary page's frames are none of the deck's business, whatever their sidecars hold
		writePageFrame(deck.root, "plain", "a", tsx("a"));
		writePageFrame(deck.root, "plain", "b", tsx("b"));
		mkdirSync(join(deck.root, "design/frames/plain/b/frame.json"));
		expect((await deck.post("frames/rename", { from: "plain/a", to: "plain/c" })).status).toBe(204);

		// a page copied carries its deck
		expect((await deck.post("pages/duplicate", { name: "talk" })).status).toBe(200);
		expect(JSON.parse(readFileSync(join(deck.root, "design/frames/talk-copy/deck.json"), "utf8")).slides).toEqual([
			"story",
			"d",
		]);
	});

	it("reads every deck, says what is wrong with one, and tells the window a deck changed", async () => {
		const deck = deckProject();
		writePageFrame(deck.root, "talk", "a", beatsTsx('["title", "price", "date"] as const'));
		writePageFrame(deck.root, "talk", "b", beatsTsx("NAMES", true));
		writePageFrame(deck.root, "talk", "loose", tsx("loose"));
		writeDesignFile(deck.root, "frames/talk/a/notes.md", "Hold it up.\n\n-\n\nSay the date.\n\nThank them.\n");
		writeDesignFile(deck.root, "frames/talk/b/notes.md", "Words.\n");
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ slides: ["b", "ghost", "a", "b"] }));
		writePageFrame(deck.root, "later", "x", tsx("x"));
		writeDesignFile(deck.root, "frames/later/deck.json", json({ version: 9, slides: ["x"] }));
		writePageFrame(deck.root, "merged", "y", tsx("y"));
		writeDesignFile(deck.root, "frames/merged/deck.json", '{ "version": 1, "slides": ["y" "z"] }\n');

		const read = (await (await deck.app.request(`/api/p/${deck.name}/decks`)).json()) as DecksRead;
		expect(read).toEqual({
			decks: [
				{
					page: "talk",
					size: { w: 1280, h: 720 },
					slides: [
						// beats it names by a constant are no beats the rail can know: it reads as one, and says why
						{ name: "talk/b", beats: [], live: true, notes: ["Words."] },
						{
							name: "talk/a",
							beats: ["title", "price", "date"],
							live: false,
							notes: ["Hold it up.", "", "Say the date.\n\nThank them."],
						},
					],
					loose: [{ name: "talk/loose", cell: { col: 0, row: 1 } }],
					problems: [
						{ kind: "missing", name: "talk/ghost" },
						{ kind: "repeated", name: "talk/b" },
						{ kind: "beats", name: "talk/b" },
						{ kind: "notes", name: "talk/a" },
					],
				},
			],
			unread: [
				{ page: "later", why: "version", problems: [] },
				{ page: "merged", why: "unparsed", problems: [{ kind: "unparsed", name: "merged" }] },
			],
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

	it("stops laying out a page another hand keeps moving back, says so, and starts again when its deck changes", async () => {
		const deck = deckProject();
		for (const folder of ["a", "b"]) writePageFrame(deck.root, "talk", folder, tsx(folder));
		await deck.change({ kind: "make", page: "talk", slides: ["a", "b"] });
		// an agent stating a slide's size again and again is no fight: it is laid out every time
		for (let round = 0; round < 4; round++) {
			writeDesignFile(deck.root, "frames/talk/a/frame.json", json({ w: 1280, h: 720 }));
			await vi.waitFor(() => expect(deck.sidecar("a")).toEqual(box(0, 0)), { timeout: 5_000 });
		}
		expect((await deck.decks()).decks[0]?.problems).toEqual([]);
		// another machine, missing a frame this one has, keeps putting b in the slot it lays b in
		const theirs = json(box(0, 0));
		for (let round = 0; round < 3; round++) {
			writeDesignFile(deck.root, "frames/talk/b/frame.json", theirs);
			await vi.waitFor(() => expect(deck.sidecar("b")).toEqual(box(1440, 0)), { timeout: 5_000 });
		}
		writeDesignFile(deck.root, "frames/talk/b/frame.json", theirs);
		await wait(QUIET);
		expect(deck.sidecar("b")).toEqual(box(0, 0));
		expect((await deck.decks()).decks[0]?.problems).toEqual([{ kind: "looping", name: "talk/b" }]);
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 1, slides: ["b", "a"] }));
		await vi.waitFor(() => expect(deck.sidecar("a")).toEqual(box(1440, 0)), { timeout: 5_000 });
		expect((await deck.decks()).decks[0]?.problems).toEqual([]);
	});

	it("catches every deck up when the daemon starts or the switch is flipped, with nobody reading decks", async () => {
		// a deck written while no daemon ran, and a change it died inside whose notes a hand wrote over since
		const started = deckProject({
			before: (root) => {
				writePageFrame(root, "talk", "a", tsx("a"));
				writePageFrame(root, "talk", "b", tsx("b"));
				writeDesignFile(root, "frames/talk/a/frame.json", json(box(0, 0)));
				writeDesignFile(root, "frames/talk/b/frame.json", json(box(1440, 0)));
				writeDesignFile(root, "frames/talk/deck.json", json({ version: 1, slides: ["b", "a"] }));
				writeDesignFile(root, "frames/talk/a/notes.md", "Written since.\n");
				const step = { path: "frames/talk/a/notes.md", before: "Before.\n", after: "After.\n" };
				writeDesignFile(root, ".spool/deck-changes/one.json", JSON.stringify({ page: "talk", steps: [step] }));
			},
		});
		await vi.waitFor(() => expect(started.sidecar("b")).toEqual(box(0, 0)), { timeout: 5_000 });
		expect(started.sidecar("a")).toEqual(box(1440, 0));
		expect(readFileSync(join(started.page, "a/notes.md"), "utf8")).toBe("Written since.\n");
		expect((await started.decks()).decks[0]?.problems).toEqual([{ kind: "interrupted", name: "talk" }]);

		// switched on by the CLI behind the daemon's back: frames born on the deck take its places, at its size
		const flipped = deckProject({ on: false });
		writePageFrame(flipped.root, "talk", "a", tsx("a"));
		writeDesignFile(flipped.root, "frames/talk/deck.json", json({ version: 1, slides: ["b", "a"] }));
		await wait(QUIET);
		expect(flipped.sidecar("a")).toBeUndefined();
		switchExperiment(createSettingsStore(flipped.spoolDir), "deck", true);
		await vi.waitFor(() => expect(flipped.sidecar("a")).toEqual(box(0, 0)), { timeout: 5_000 });
		writePageFrame(flipped.root, "talk", "b", tsx("b"));
		const frames = (await (await flipped.app.request(`/api/p/${flipped.name}/frames`)).json()) as {
			frames: { name: string; x: number; y: number; w: number; h: number }[];
		};
		expect(frames.frames.find((frame) => frame.name === "talk/b")).toMatchObject(box(0, 0));
		await vi.waitFor(() => expect(flipped.sidecar("a")).toEqual(box(1440, 0)), { timeout: 5_000 });
	});

	it("answers nothing and writes nothing with the experiment off", async () => {
		const deck = deckProject({ on: false });
		writePageFrame(deck.root, "talk", "a", tsx("a"));
		writePageFrame(deck.root, "talk", "b", tsx("b"));
		writeDesignFile(deck.root, "frames/talk/deck.json", json({ version: 1, slides: ["b", "a"] }));
		await wait(QUIET);
		expect(deck.sidecar("a")).toBeUndefined();
		expect((await deck.app.request(`/api/p/${deck.name}/decks`)).status).toBe(404);
		expect((await deck.app.request(`/api/p/${deck.name}/deck-export?page=talk`)).status).toBe(404);
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
