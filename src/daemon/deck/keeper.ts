import { watch } from "node:fs";
import { DECK_FILE } from "../../deck/deck-file";
import { type Box, placesOf, settle } from "../../deck/layout";
import type { DeckProblem } from "../../deck/wire";
import { pageParent, pageUnder, ROOT_PAGE } from "../../page-path";
import { realDesignDir } from "../design-path";
import type { ChangeEvent } from "../events";
import { parseSidecar } from "../sidecar";
import { reconcileDeck } from "./change";
import { deckFileOf, deckFramesOf, deckPages, holdsDeck, readDesignFile, readPage } from "./disk";
import { recoverDeckChanges } from "./journal";

/**
 * Keeping every deck laid out (spool#265) whatever hand changed it: an agent writing `deck.json` or a frame, a
 * teammate's save arriving through sync, an editor. The daemon hears it on the change hub and, once the page has been
 * quiet for a moment, reconciles it, which writes only the sidecars whose place differs. Its own writes come back as
 * changes too, and reconcile them to nothing, which is where the echo ends.
 *
 * Only while the experiment is on: off, nothing here reads or writes, and a deck page is an ordinary page. Switched on
 * while the daemon runs, from Settings or the CLI, every deck is caught up as at a start.
 */

/** How long a deck's page has to be quiet before it is laid out: a burst of writes is one reconcile, after the last. */
export const DECK_QUIET_MS = 300;

/**
 * When another hand keeps putting a frame back, placed, where this spool does not lay it (another machine whose frames differ,
 * another spool's layout), the two would write over each other for as long as both run. The same rewrite of the same
 * frame this many times inside this window, with the deck's file unchanged, is taken for that, and the page is left
 * alone until its `deck.json` changes or the daemon restarts.
 */
export const LOOP_WRITES = 3;
export const LOOP_WINDOW_MS = 30_000;

/** The projects whose decks this daemon keeps, and whether it keeps them now; asked by `deckPlaceOf`. */
const kept = new Map<string, () => boolean>();

export function createDeckKeeper(deps: {
	subscribe: (root: string, listener: (event: ChangeEvent) => void) => () => void;
	/** Whether the experiment is on, read fresh, so a switch flipped in Settings or the CLI holds at once. */
	on: () => boolean;
	quietMs?: number;
	now?: () => number;
	log?: (line: string) => void;
}) {
	const watches = new Map<string, () => void>();
	/** the projects this keeper answers `deckPlaceOf` for */
	const mine = new Set<string>();
	/** pages to lay out once quiet: `heard` when a write was heard on them, rather than caught up at a first watch */
	const waiting = new Map<string, { root: string; timer: NodeJS.Timeout; heard: boolean }>();
	const quiet = deps.quietMs ?? DECK_QUIET_MS;
	const now = deps.now ?? Date.now;
	/** per page: the deck's file as last laid out, and each frame's last rewrite, how often and since when */
	const fights = new Map<
		string,
		{ deck: string | null; frames: Map<string, { rewrite: string; count: number; since: number }> }
	>();
	/** pages left alone, with the frames fought over */
	const stuck = new Map<string, string[]>();
	/** projects with a change stopped half way that a hand wrote over since, by page */
	const interrupted = new Map<string, Set<string>>();
	const keyOf = (root: string, page: string) => `${root}\0${page}`;

	function deckBytes(root: string, page: string): string | null {
		try {
			return readDesignFile(realDesignDir(root), `frames/${page}/${DECK_FILE}`);
		} catch {
			return null;
		}
	}

	function run(root: string, page: string): void {
		if (!deps.on()) return;
		const key = keyOf(root, page);
		try {
			const deck = deckBytes(root, page);
			const seen = fights.get(key);
			if (seen === undefined || seen.deck !== deck) {
				fights.set(key, { deck, frames: new Map() });
				stuck.delete(key);
			}
			if (stuck.has(key)) return;
			const fight = fights.get(key)?.frames ?? new Map();
			const at = now();
			const fought: string[] = [];
			for (const { folder, from, to } of reconcileDeck(root, page)) {
				// only a place written over is a fight: a size stated again, as an agent states a slide's, is not
				if (!placed(from)) {
					fight.delete(folder);
					continue;
				}
				const rewrite = `${from ?? ""}\0${to}`;
				const last = fight.get(folder);
				const count =
					last !== undefined && last.rewrite === rewrite && at - last.since <= LOOP_WINDOW_MS ? last.count + 1 : 1;
				fight.set(folder, { rewrite, count, since: count === 1 ? at : (last?.since ?? at) });
				if (count >= LOOP_WRITES) fought.push(folder);
			}
			if (fought.length > 0) {
				stuck.set(key, fought);
				deps.log?.(
					`stopped laying out deck "${page}": another hand keeps moving ${fought.join(", ")} back (another machine or spool)`,
				);
			}
		} catch (error) {
			// a project whose design folder went strange keeps nothing laid out, and never takes the daemon down
			deps.log?.(`could not lay out deck "${page}": ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	function soon(root: string, page: string, heard: boolean): void {
		const key = keyOf(root, page);
		const held = waiting.get(key);
		if (held !== undefined) clearTimeout(held.timer);
		const timer = setTimeout(() => {
			waiting.delete(key);
			run(root, page);
		}, quiet);
		timer.unref?.();
		waiting.set(key, { root, timer, heard: heard || held?.heard === true });
	}

	function heard(root: string, event: ChangeEvent): void {
		if (!deps.on()) return;
		if (event.kind === "deck") soon(root, event.page, true);
		else if (event.kind === "frame" || event.kind === "geometry") {
			const page = pageParent(event.frame);
			if (page !== ROOT_PAGE && holdsDeck(root, page)) soon(root, page, true);
		}
	}

	/**
	 * Keep one project's decks: idempotent, so every read of a project's decks can ask. The first time, a change the
	 * daemon died inside is put back and every deck is laid out once the quiet period has passed, so what changed while
	 * nobody kept the project is caught up without anyone asking.
	 */
	function watch(root: string): void {
		kept.set(root, deps.on);
		mine.add(root);
		if (watches.has(root) || !deps.on()) return;
		watches.set(
			root,
			deps.subscribe(root, (event) => heard(root, event)),
		);
		try {
			const designDir = realDesignDir(root);
			interrupted.set(root, new Set(recoverDeckChanges(designDir, deps.log)));
			for (const page of deckPages(root)) soon(root, page, false);
		} catch (error) {
			deps.log?.(`could not catch up decks in ${root}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	function stop(root: string): void {
		watches.get(root)?.();
		watches.delete(root);
		interrupted.delete(root);
		for (const [key, held] of waiting) {
			if (held.root !== root) continue;
			clearTimeout(held.timer);
			waiting.delete(key);
		}
		for (const key of [...fights.keys(), ...stuck.keys()]) {
			if (!key.startsWith(`${root}\0`)) continue;
			fights.delete(key);
			stuck.delete(key);
		}
	}

	return {
		watch,
		/** The projects to keep, as the registry has them now: none is watched while the experiment is off. */
		keeping(roots: readonly string[]): void {
			const on = deps.on();
			for (const root of [...mine]) {
				if (roots.includes(root)) continue;
				mine.delete(root);
				kept.delete(root);
			}
			for (const root of [...watches.keys()]) if (!on || !roots.includes(root)) stop(root);
			for (const root of roots) watch(root);
		},
		/**
		 * Every deck of a project laid out now, as a read of its decks first does, but a page somebody is writing: it
		 * keeps its quiet period, so a window reading on every change never lays a page out inside a burst of writes.
		 */
		settleAll(root: string): void {
			if (!deps.on()) return;
			for (const page of deckPages(root)) {
				const key = keyOf(root, page);
				const held = waiting.get(key);
				if (held?.heard === true) continue;
				if (held !== undefined) clearTimeout(held.timer);
				waiting.delete(key);
				run(root, page);
			}
		},
		/** What the keeper knows is wrong with a deck that its files do not say. */
		problems(root: string, page: string): DeckProblem[] {
			return [
				...(stuck.get(keyOf(root, page)) ?? []).map((folder) => ({
					kind: "looping" as const,
					name: pageUnder(page, folder),
				})),
				...(interrupted.get(root)?.has(page) === true ? [{ kind: "interrupted" as const, name: page }] : []),
			];
		},
		close(): void {
			for (const root of [...watches.keys()]) stop(root);
			for (const root of mine) kept.delete(root);
			mine.clear();
		},
	};
}

export type DeckKeeper = ReturnType<typeof createDeckKeeper>;

/** Whether a sidecar's bytes place their frame, rather than only size it or say nothing. */
function placed(bytes: string | undefined): boolean {
	if (bytes === undefined) return false;
	try {
		return parseSidecar(JSON.parse(bytes)).kind === "placed";
	} catch {
		return false;
	}
}

/**
 * The experiment switched in `config.json` by whatever hand, Settings or `spool experiments`: `changed` is called on
 * every write of it, and asks the experiment fresh. Nothing when the folder cannot be watched.
 */
export function watchDeckSwitch(spoolDir: string, changed: () => void): () => void {
	try {
		const watcher = watch(spoolDir, (_event, filename) => {
			if (filename === null || String(filename).startsWith("config.json")) changed();
		});
		watcher.on("error", () => {});
		return () => watcher.close();
	} catch {
		return () => {};
	}
}

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
