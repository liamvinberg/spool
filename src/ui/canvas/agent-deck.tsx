import { createContext, type ReactNode, useContext, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { type AgentDeck, useAgentThreads } from "./agent-stream";

/**
 * The project's agent threads, held outside the canvas's render (task 169).
 *
 * A running turn redraws its rail ten times a second, and while the threads lived in the
 * canvas component every one of those redraws was the whole canvas's: every pane, row and
 * frame shell, for a clock and a transcript only the rail draws. Here the threads live in
 * a component of their own whose child is the canvas, handed in once, so a tick redraws
 * the host and stops there. Whatever wants the deck subscribes to the part it draws, and
 * redraws when that part says something new; the rail, which draws all of it, redraws
 * with the host.
 */
export interface DeckStore {
	get(): AgentDeck;
	subscribe(listener: () => void): () => void;
}

export interface HeldDeck extends DeckStore {
	/** the deck as the host last rendered it, before anyone is told */
	hold(deck: AgentDeck): void;
	/** tell everyone the deck they read may have moved */
	tell(): void;
}

export function createDeckStore(): HeldDeck {
	let deck: AgentDeck | null = null;
	const listeners = new Set<() => void>();
	return {
		get() {
			if (deck === null) throw new Error("the agent deck is read before its host has rendered");
			return deck;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		hold(next) {
			deck = next;
		},
		tell() {
			for (const listener of [...listeners]) listener();
		},
	};
}

/**
 * Runs the threads and renders `children`, which the canvas hands in as one element made
 * outside this, so a redraw here leaves it alone. The deck is held while rendering,
 * because the canvas renders right after this and reads it then, and told once the
 * commit lands.
 */
export function AgentDeckHost({
	store,
	project,
	preferred,
	root,
	children,
}: {
	store: HeldDeck;
	project: string;
	preferred: AgentEngineId | undefined;
	root: string | undefined;
	children: ReactNode;
}): ReactNode {
	const deck = useAgentThreads(project, preferred, root);
	store.hold(deck);
	// biome-ignore lint/correctness/useExhaustiveDependencies(deck): a new deck is the one thing to tell
	useLayoutEffect(() => store.tell(), [store, deck]);
	return <WholeDeck.Provider value={deck}>{children}</WholeDeck.Provider>;
}

/**
 * The whole deck for the rail, which draws all of it. Context rather than the store, so the
 * rail redraws in the host's own render: told after the commit, it would be a second one.
 */
const WholeDeck = createContext<AgentDeck | null>(null);

/**
 * One part of the deck, redrawn only when `equal` says it moved. `select` may be a fresh
 * closure every render: what it picked last stands as long as it is equal to what it picks.
 */
export function useDeck<T>(
	store: DeckStore,
	select: (deck: AgentDeck) => T,
	equal: (a: T, b: T) => boolean = Object.is,
): T {
	const last = useRef<{ deck: AgentDeck; select: (deck: AgentDeck) => T; value: T } | null>(null);
	const read = () => {
		const deck = store.get();
		const was = last.current;
		if (was !== null && was.deck === deck && was.select === select) return was.value;
		const picked = select(deck);
		const value = was !== null && equal(was.value, picked) ? was.value : picked;
		last.current = { deck, select, value };
		return value;
	};
	return useSyncExternalStore(store.subscribe, read);
}

/** The whole deck, for the rail, inside an `AgentDeckHost`. */
export function useWholeDeck(): AgentDeck {
	const deck = useContext(WholeDeck);
	if (deck === null) throw new Error("the agent rail is drawn outside its deck's host");
	return deck;
}
