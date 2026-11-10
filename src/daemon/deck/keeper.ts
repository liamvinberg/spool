import { type Box, placesOf, settle } from "../../deck/layout";
import { pageParent, ROOT_PAGE } from "../../page-path";
import type { ChangeEvent } from "../events";
import { reconcileDeck } from "./change";
import { deckFileOf, deckFramesOf, deckPages, holdsDeck, readPage } from "./disk";

/**
 * Keeping every deck laid out (spool#265) whatever hand changed it: an agent writing `deck.json` or a frame, a
 * teammate's save arriving through sync, an editor. The daemon hears it on the change hub and, once the page has been
 * quiet for a moment, reconciles it, which writes only the sidecars whose place differs. Its own writes come back as
 * changes too, and reconcile them to nothing, which is where the echo ends.
 *
 * Only while the experiment is on: off, nothing here reads or writes, and a deck page is an ordinary page.
 */

/** How long a deck's page has to be quiet before it is laid out: a burst of writes is one reconcile, after the last. */
export const DECK_QUIET_MS = 300;

/** The projects whose decks this daemon keeps, and whether it keeps them now; asked by `deckPlaceOf`. */
const kept = new Map<string, () => boolean>();

export function createDeckKeeper(deps: {
	subscribe: (root: string, listener: (event: ChangeEvent) => void) => () => void;
	/** Whether the experiment is on, read fresh, so a switch flipped in Settings holds at once. */
	on: () => boolean;
	quietMs?: number;
	log?: (line: string) => void;
}) {
	const watches = new Map<string, () => void>();
	const waiting = new Map<string, { root: string; timer: NodeJS.Timeout }>();
	const quiet = deps.quietMs ?? DECK_QUIET_MS;

	function run(root: string, page: string): void {
		if (!deps.on()) return;
		try {
			reconcileDeck(root, page);
		} catch (error) {
			// a project whose design folder went strange keeps nothing laid out, and never takes the daemon down
			deps.log?.(`could not lay out deck "${page}": ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	function soon(root: string, page: string): void {
		const key = `${root}\0${page}`;
		const held = waiting.get(key);
		if (held !== undefined) clearTimeout(held.timer);
		const timer = setTimeout(() => {
			waiting.delete(key);
			run(root, page);
		}, quiet);
		timer.unref?.();
		waiting.set(key, { root, timer });
	}

	function heard(root: string, event: ChangeEvent): void {
		if (!deps.on()) return;
		if (event.kind === "deck") soon(root, event.page);
		else if (event.kind === "frame" || event.kind === "geometry") {
			const page = pageParent(event.frame);
			if (page !== ROOT_PAGE && holdsDeck(root, page)) soon(root, page);
		}
	}

	/** Keep one project's decks: idempotent, so every read of a project's decks can ask. */
	function watch(root: string): void {
		kept.set(root, deps.on);
		if (watches.has(root)) return;
		watches.set(
			root,
			deps.subscribe(root, (event) => heard(root, event)),
		);
	}

	function stop(root: string): void {
		watches.get(root)?.();
		watches.delete(root);
		kept.delete(root);
		for (const [key, held] of waiting) {
			if (held.root !== root) continue;
			clearTimeout(held.timer);
			waiting.delete(key);
		}
	}

	return {
		watch,
		/** The projects to keep, as the registry has them now. */
		keeping(roots: readonly string[]): void {
			for (const root of [...watches.keys()]) if (!roots.includes(root)) stop(root);
			for (const root of roots) watch(root);
		},
		/** Every deck of a project laid out now, as a read of its decks first does. */
		settleAll(root: string): void {
			if (!deps.on()) return;
			for (const page of deckPages(root)) run(root, page);
		},
		close(): void {
			for (const root of [...watches.keys()]) stop(root);
		},
	};
}

export type DeckKeeper = ReturnType<typeof createDeckKeeper>;

/**
 * Where a frame born on a deck's page goes, for the projection placing a frame that has no place yet: its slot or cell,
 * at the talk's size when it states none. Nothing for a page that is no deck here, which the projection places as it
 * places any page's frames. Asked rather than waited for, so whoever places a new frame first places it where the
 * deck will keep it, and a frame never lands at the canvas's own default size only for the deck to take that for a
 * shape of its own.
 */
export function deckPlaceOf(root: string, page: string | undefined, folder: string): Box | undefined {
	if (page === undefined || kept.get(root)?.() !== true) return undefined;
	try {
		const found = readPage(root, page);
		const read = found === undefined ? undefined : deckFileOf(found);
		if (found === undefined || read?.kind !== "deck") return undefined;
		const { frames } = deckFramesOf(found);
		return placesOf(settle(read.file.size, read.file.slides, frames)).get(folder);
	} catch {
		return undefined;
	}
}
