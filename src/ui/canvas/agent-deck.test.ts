// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import { createDeckStore, useDeck } from "./agent-deck";
import type { AgentDeck } from "./agent-stream";

/** The agent deck read outside the canvas's render (task 169): a part redraws only when it moves. */

const deckWith = (open: string, phase: AgentDeck["turn"]["phase"]) =>
	({ open, turn: { phase } }) as unknown as AgentDeck;

describe("a part of the agent deck", () => {
	it("redraws when what it picks moves, and not for a deck that only moved elsewhere", () => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		const store = createDeckStore();
		store.hold(deckWith("a", "playing"));
		const drawn: string[] = [];
		function Open() {
			const open = useDeck(store, (deck) => deck.open);
			drawn.push(open);
			return null;
		}
		const root = createRoot(document.createElement("div"));
		onTestFinished(() => act(() => root.unmount()));
		act(() => root.render(createElement(Open)));
		expect(drawn).toEqual(["a"]);
		// a tick: a new deck, the same open thread
		act(() => {
			store.hold(deckWith("a", "asking"));
			store.tell();
		});
		expect(drawn).toEqual(["a"]);
		act(() => {
			store.hold(deckWith("b", "asking"));
			store.tell();
		});
		expect(drawn).toEqual(["a", "b"]);
	});
});
