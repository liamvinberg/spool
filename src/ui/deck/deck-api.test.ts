import { expect, it } from "vitest";
import type { DeckRead, DecksRead } from "../../deck/wire";
import { createDeckReads } from "./deck-api";

const deckOn = (page: string, slides: string[]): DeckRead => ({
	page,
	size: { w: 1280, h: 720 },
	slides: slides.map((name) => ({ name: `${page}/${name}`, beats: [], live: false, notes: [""] })),
	loose: [],
	problems: [],
});

it("keeps a change's answer over a read that set off before it and came back after", async () => {
	let answer: (read: DecksRead) => void = () => {};
	const reads = createDeckReads("p", () => new Promise((resolve) => (answer = resolve)));
	const heard: number[] = [];
	reads.subscribe(() => heard.push(heard.length));

	const stale = reads.refresh();
	// the drop's answer lands while that read is out
	reads.take("talk", deckOn("talk", ["b", "a"]));
	answer({ decks: [deckOn("talk", ["a", "b"])], unread: [] });
	await stale;
	expect(reads.deckOf("talk")?.slides.map((slide) => slide.name)).toEqual(["talk/b", "talk/a"]);

	// a read set off after it is newer, and stands
	const fresh = reads.refresh();
	answer({ decks: [deckOn("talk", ["a", "b"])], unread: [] });
	await fresh;
	expect(reads.deckOf("talk")?.slides.map((slide) => slide.name)).toEqual(["talk/a", "talk/b"]);
	// and a page whose answer is no deck is none
	reads.take("talk", null);
	expect(reads.deckOf("talk")).toBeUndefined();
	expect(heard).toHaveLength(3);
});
