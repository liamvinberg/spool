import { useMemo, useSyncExternalStore } from "react";
import type { DeckChange, DeckRead, DecksRead } from "../../deck/wire";
import { pageUnder } from "../../page-path";
import type { CapturedFrame } from "../canvas/frame-export";
import { cn } from "../cn";
import { IconButton } from "../primitives/actions";
import { changeDeck, type DeckEntry, type DeckReads } from "./deck-api";
import { folderOf } from "./deck-drag";
import { presentDeck } from "./present";
import type { Talk } from "./talk-export";

/**
 * A deck in the Pages rail (spool#265, the team canvas's `app/spool-deck`): what the rail asks of a page that is a
 * deck. Its rows are plain names, the talk in the order it plays, a hairline, then the loose frames; a row dragged
 * along the talk or across the hairline sends the deck change the same drop on the canvas sends. Its own row has the
 * deck's icon and one action, Present. New presentation, beside New page, makes a deck page holding the starter.
 *
 * The rail's stored order never holds a deck page's rows: they come from the deck read, so moving a slide anywhere
 * moves its row here too.
 */

/** What the canvas hands the rail for its decks. */
export interface DeckRailKit {
	readonly project: string;
	/** the project's deck reads, the canvas's own; none with the experiment off */
	readonly reads: DeckReads | null;
	/** say why a change was refused */
	readonly say: (message: string) => void;
	/** New presentation made a page: the canvas opens it and hands the person to the agent */
	readonly made: (page: string) => void;
	/** a slide of a deck page as the canvas draws it, for the talk's PDF (spool#275): the page is opened first if need be */
	readonly capture: (page: string, frame: string) => Promise<CapturedFrame>;
}

export interface DeckRail {
	/** decks are on: New presentation is offered */
	readonly on: boolean;
	isDeck(page: string): boolean;
	/**
	 * A deck page's frames in the rail's order, the talk first and then the loose frames down each column of the grid
	 * in turn, and how many of them are the talk; nothing for a page that is no deck. Frames the deck read has not
	 * caught up with yet come last.
	 */
	arrange(
		page: string,
		names: readonly string[],
	): { readonly names: readonly string[]; readonly talk: number } | undefined;
	/**
	 * Frames of a deck page dropped at `index` of its rows: above the hairline they join the talk there, under it the
	 * slides among them leave it. The entry to record, when the deck changed.
	 */
	drop(page: string, names: readonly string[], index: number, before: boolean): Promise<DeckEntry | undefined>;
	/** Present the talk from its start. */
	present(page: string): void;
	/** A deck page's talk, to export (spool#275); nothing for a page that is no deck or has no slides yet. */
	talk(page: string): Talk | undefined;
	/** A slide of a deck page as the canvas draws it, for the talk's PDF. */
	capture(page: string, frame: string): Promise<CapturedFrame>;
	/** New presentation inside `parent`: the page it made, named fresh, or null when it was refused. */
	make(parent: string, claimed: (path: string) => boolean): Promise<string | null>;
}

const NONE = () => () => {};
const NO_DECKS = () => null;

/** The fresh name New presentation gives its page. */
export const PRESENTATION = "presentation";

export function useDeckRail(kit: DeckRailKit | undefined): DeckRail {
	const reads = kit?.reads ?? null;
	const decks = useSyncExternalStore(reads?.subscribe ?? NONE, reads === null ? NO_DECKS : reads.get);
	return useMemo(() => deckRail(kit, reads, decks), [kit, reads, decks]);
}

function deckRail(kit: DeckRailKit | undefined, reads: DeckReads | null, decks: DecksRead | null): DeckRail {
	const deckOf = (page: string): DeckRead | undefined => decks?.decks.find((deck) => deck.page === page);
	return {
		on: reads !== null,
		isDeck: (page) => deckOf(page) !== undefined,
		arrange(page, names) {
			const deck = deckOf(page);
			if (deck === undefined) return undefined;
			const present = new Set(names);
			const talk = deck.slides.map((slide) => slide.name).filter((name) => present.has(name));
			const loose = [...deck.loose]
				.sort((a, b) => a.cell.col - b.cell.col || a.cell.row - b.cell.row)
				.map((spot) => spot.name)
				.filter((name) => present.has(name));
			const placed = new Set([...talk, ...loose]);
			return { names: [...talk, ...loose, ...names.filter((name) => !placed.has(name))], talk: talk.length };
		},
		async drop(page, names, index, before) {
			const deck = deckOf(page);
			if (kit === undefined || reads === null || deck === undefined) return undefined;
			const folders = names.map((name) => folderOf(page, name));
			const slides = new Set(deck.slides.map((slide) => folderOf(page, slide.name)));
			const leaving = folders.filter((folder) => slides.has(folder));
			const change: DeckChange | undefined = before
				? { kind: "insert", page, frames: folders, at: Math.min(index, deck.slides.length) }
				: leaving.length > 0
					? { kind: "place", page, frames: leaving }
					: undefined;
			// loose frames stay where they rest: the grid, not the list, says where a loose frame is
			if (change === undefined) return undefined;
			const sent = await changeDeck(kit.project, reads, change);
			if (sent.kind === "refused") {
				kit.say(sent.message);
				return undefined;
			}
			return sent.entry;
		},
		talk(page) {
			const deck = deckOf(page);
			if (kit === undefined || deck === undefined || deck.slides.length === 0) return undefined;
			return { project: kit.project, page, slides: deck.slides.map((slide) => slide.name) };
		},
		capture(page, frame) {
			if (kit === undefined) return Promise.reject(new Error("decks are off"));
			return kit.capture(page, frame);
		},
		present(page) {
			const first = deckOf(page)?.slides[0];
			if (kit !== undefined && first !== undefined) presentDeck({ project: kit.project, page, slide: first.name });
		},
		async make(parent, claimed) {
			if (kit === undefined || reads === null) return null;
			let name = PRESENTATION;
			for (let suffix = 2; claimed(pageUnder(parent, name)); suffix++) name = `${PRESENTATION}-${suffix}`;
			const page = pageUnder(parent, name);
			const sent = await changeDeck(kit.project, reads, { kind: "make", page, starter: true });
			if (sent.kind === "refused") {
				kit.say(sent.message);
				return null;
			}
			kit.made(page);
			return page;
		},
	};
}

/** A deck page's icon in the Pages rail, where any other page has a folder. */
export function DeckGlyph({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
			<path d="M4.5 2.25h7M6 13.75h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
		</svg>
	);
}

function PresentGlyph() {
	return (
		<svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
			<path d="M5 3.6v8.8L12.2 8Z" fill="currentColor" />
		</svg>
	);
}

/** A deck page row's one action. */
export function PresentButton({ onPresent }: { onPresent: () => void }) {
	return (
		<IconButton
			size="sm"
			icon={<PresentGlyph />}
			label="Present  ⌘↵ · from the start ⇧⌘↵"
			data-deck-present=""
			// the row under it starts a drag and picks the page on a press; this press is neither
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.stopPropagation();
				onPresent();
			}}
		/>
	);
}

/**
 * The hairline between a deck's talk and its loose frames, `LINE` tall from `top`: the page's spine runs on through
 * it to the loose frames, and the line itself firms while a row is carried.
 */
export function DeckHairline({
	top,
	spine,
	room,
	carrying,
	tail,
}: {
	top: number;
	/** where the page's spine runs, in px from the list's start */
	spine: number;
	/** px it slides down to make room for a gap above it */
	room: number;
	carrying: boolean;
	/** rows of the page come after it, so the spine runs on */
	tail: boolean;
}) {
	return (
		<div
			aria-hidden="true"
			data-deck-hairline=""
			className="pointer-events-none absolute inset-x-0"
			style={{
				height: 12,
				transform: `translateY(${top + room}px)`,
				transition: "transform var(--transition-duration-slow) var(--ease-snap)",
			}}
		>
			{tail ? <span className="absolute inset-y-0 w-px bg-line-strong" style={{ left: spine }} /> : null}
			<span
				className={cn(
					"absolute top-1/2 right-3 h-px transition-colors duration-base ease-out",
					carrying ? "bg-line-strong" : "bg-line-default",
				)}
				style={{ left: spine + 12 }}
			/>
		</div>
	);
}
