import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Size } from "../../deck/deck-file";
import { type Box, type Deck, placesOf } from "../../deck/layout";
import type { DeckRead } from "../../deck/wire";
import type { CameraStore } from "../canvas/camera-store";
import { useCameraFollow } from "../canvas/camera-store";
import { type CanvasStore, useCanvasState } from "../canvas/canvas-store";
import { cn } from "../cn";
import { changeDeck, type DeckEntry, type DeckReads, useDeckRead, useDeckReads, walkDeck } from "./deck-api";
import { type Aim, aimOf, BAND_ROOM, deckOfRead, folderOf, nameOf } from "./deck-drag";
import { createFrameTween, easing, type Point, useDeckMotion } from "./deck-motion";
import { presentDeck, presentKeyFrom } from "./present";

/**
 * The deck page on the canvas (spool#265, the team canvas's `app/spool-deck`): what the canvas asks of a page that
 * is a deck. On one the canvas's own snapping, guides and resize handles stand down, and the deck's stand instead:
 * a held frame follows the pointer, the frames around it make room as letting go would leave them, one outline shows
 * the slot or cell it lands in, and letting go sends the one deck change that does it. The window previews; the
 * daemon decides and writes the places, which arrive as the same numbers.
 *
 * `useDeckPage` is the whole of it for the canvas, `DeckLayer` the band and the outline it draws under the frames.
 */

/** A frame's name label over it, in screen pixels: the band reaches over it. */
const LABEL = 28;
/** What a slide's play says it does. */
const PRESENT_TITLE = "Present from here ⌘↵";

export interface DeckPage {
	/** The page in front is a deck, and the deck's rules hold on it. */
	readonly on: boolean;
	/** The page's deck as last read, while it is one. */
	readonly read: DeckRead | undefined;
	/** The project's deck reads, for whatever else shows a deck (the Pages rail, Properties). */
	readonly reads: DeckReads | null;
	/** The number a slide's label carries before its name, from 1; none for a loose frame, or one held. */
	numberOf(name: string): number | undefined;
	/**
	 * What a frame's play does: a slide's presents from it, any other frame's is `play`, and a frame held has none.
	 * The functions handed back are the same ones for the page's life, so a label is not drawn again for them.
	 */
	playOf(name: string, play: (name: string) => void): ((name: string) => void) | undefined;
	/** What a frame's play says it does, where that is not playing it. */
	playTitleOf(name: string): string | undefined;
	/**
	 * Frames held on the page moved: `origins` where each stood as the drag began, `by` how far the pointer has gone
	 * since in page pixels, `start` where it was pressed. False when the deck has nothing to say about them (the
	 * page is no deck), and the canvas moves them its own way.
	 */
	hold(origins: ReadonlyMap<string, Point>, by: Point, start: Point): boolean;
	/** Let go: sends the change the drop makes. False when no deck drag was going on. */
	drop(): boolean;
	/** The drag ended without a drop (escaped, or carried off to another page): everything back to its place. */
	cancel(): void;
	/** Run a deck entry of the undo stack back or forward. False when the daemon refused it as stale. */
	walk(entry: DeckEntry, way: "undo" | "redo"): Promise<boolean>;
	/** Whether the page in front is a deck, read when called: for handlers made before the deck was read. */
	owns(): boolean;
	/**
	 * ⌘↵ (`first` false) or ⇧⌘↵ (`first` true) on the page: presents from the slide held, or the first. False when the
	 * key is not the deck's (the page is no deck, or what is held is no one slide), and the canvas's own key stands.
	 */
	presentKey(first: boolean): boolean;
	/** What `DeckLayer` draws: the talk's size, where a held frame lands, and whether that is in the talk. */
	/** `sending`: a drop's change is out, and its undo entry not yet in. */
	readonly view: {
		readonly talk: Size;
		readonly landing: Box | null;
		readonly lifted: boolean;
		readonly sending: boolean;
	};
}

interface Holding {
	readonly base: Deck;
	readonly frames: readonly string[];
	readonly grabbed: string;
	aim: Aim | null;
	key: string;
}

export function useDeckPage({
	project,
	page,
	store,
	record,
	say,
}: {
	project: string;
	/** the page in front */
	page: string;
	store: CanvasStore;
	/** record one undo entry */
	record: (entry: DeckEntry) => void;
	/** say why a change was refused */
	say: (message: string) => void;
}): DeckPage {
	const hands = useRef({ record, say });
	hands.current = { record, say };
	const reads = useDeckReads(project);
	const read = useDeckRead(reads, page);
	const on = read !== undefined;
	const live = useRef({ read, page, on, project });
	live.current = { read, page, on, project };
	const tween = useMemo(() => createFrameTween(store), [store]);
	useEffect(() => () => tween.stop(), [tween]);
	const holding = useRef<Holding | null>(null);
	const [aim, setAim] = useState<{ aim: Aim | null; held: ReadonlySet<string> } | null>(null);
	// the talk as a drop left it, until the daemon's answer says so too
	const [pending, setPending] = useState<readonly string[] | null>(null);

	/** The deck a read describes, sized as the canvas has its frames. */
	const deckOf = useCallback(
		(deck: DeckRead): Deck => {
			const frames = new Map(store.get().frames.map((frame) => [frame.name, frame]));
			return deckOfRead(deck, (name) => {
				const frame = frames.get(name);
				return frame === undefined ? undefined : { w: frame.w, h: frame.h };
			});
		},
		[store],
	);
	/** Every frame of a deck to its place, gliding; `except` stays where the hand has it. */
	const settle = useCallback(
		(deck: Deck, on: string, except: ReadonlySet<string> = new Set()) => {
			const goals = new Map<string, Point>();
			for (const [folder, box] of placesOf(deck)) {
				const name = nameOf(on, folder);
				if (!except.has(name)) goals.set(name, { x: box.x, y: box.y });
			}
			tween.to(goals);
		},
		[tween],
	);

	const line = aim?.aim?.deck.line ?? pending;
	const numbers = useMemo(() => {
		if (read === undefined) return new Map<string, number>();
		const folders = line ?? read.slides.map((slide) => folderOf(page, slide.name));
		return new Map(folders.map((folder, index) => [nameOf(page, folder), index + 1]));
	}, [read, line, page]);
	const numberOf = useCallback(
		(name: string) => (aim?.held.has(name) === true ? undefined : numbers.get(name)),
		[numbers, aim],
	);
	const present = useCallback((name: string) => presentDeck({ project, page, slide: name }), [project, page]);
	const playOf = useCallback(
		(name: string, play: (name: string) => void) =>
			aim?.held.has(name) === true ? undefined : numbers.has(name) ? present : play,
		[numbers, aim, present],
	);
	const playTitleOf = useCallback((name: string) => (numbers.has(name) ? PRESENT_TITLE : undefined), [numbers]);

	const hold = useCallback(
		(origins: ReadonlyMap<string, Point>, by: Point, start: Point) => {
			const { read: deck, page: on } = live.current;
			if (deck === undefined) return false;
			let held = holding.current;
			if (held === null) {
				const base = deckOf(deck);
				const known = new Set([...base.line, ...base.loose.map((spot) => spot.folder)]);
				const names = [...origins.keys()].filter((name) => known.has(folderOf(on, name)));
				if (names.length === 0) return false;
				// the frame under the press is the one whose middle decides
				const grabbed =
					names.find((name) => {
						const at = origins.get(name) as Point;
						const size = base.sizes[folderOf(on, name)] ?? base.talk;
						return start.x >= at.x && start.x <= at.x + size.w && start.y >= at.y && start.y <= at.y + size.h;
					}) ?? (names[0] as string);
				held = { base, frames: names.map((name) => folderOf(on, name)), grabbed, aim: null, key: "" };
				holding.current = held;
			}
			// what is held follows the pointer, with nothing to snap to
			store.set((state) => ({
				frames: state.frames.map((frame) => {
					const origin = origins.get(frame.name);
					return origin === undefined ? frame : { ...frame, x: origin.x + by.x, y: origin.y + by.y };
				}),
			}));
			const from = origins.get(held.grabbed) as Point;
			const next = aimOf(held.base, {
				frames: held.frames,
				grabbed: folderOf(on, held.grabbed),
				at: { x: from.x + by.x, y: from.y + by.y },
			});
			const key = next === null ? "" : JSON.stringify(next.rule);
			if (key !== held.key || held.aim === null) {
				held.aim = next;
				held.key = key;
				const names = new Set(origins.keys());
				setAim({ aim: next, held: names });
				settle(next?.deck ?? held.base, on, names);
			}
			return true;
		},
		[deckOf, settle, store],
	);

	const cancel = useCallback(() => {
		const held = holding.current;
		holding.current = null;
		setAim(null);
		if (held !== null) settle(held.base, live.current.page);
	}, [settle]);

	const drop = useCallback(() => {
		const held = holding.current;
		if (held === null) return false;
		holding.current = null;
		setAim(null);
		const on = live.current.page;
		const aimed = held.aim;
		if (aimed === null || aimed.same) {
			settle(held.base, on);
			return true;
		}
		const deckReads = reads;
		if (deckReads === null) return true;
		setPending(aimed.deck.line);
		settle(aimed.deck, on);
		void changeDeck(project, deckReads, { ...aimed.rule, page: on }).then((sent) => {
			setPending(null);
			if (sent.kind === "refused") {
				hands.current.say(sent.message);
				const now = deckReads.deckOf(on);
				settle(now === undefined ? held.base : deckOf(now), on);
				return;
			}
			if (sent.entry !== undefined) hands.current.record(sent.entry);
		});
		return true;
	}, [deckOf, project, reads, settle]);

	const walk = useCallback(
		async (entry: DeckEntry, way: "undo" | "redo") => {
			if (reads === null) return false;
			const sent = await walkDeck(project, reads, entry, way);
			if (sent.kind === "refused") return false;
			const deck = sent.answer.deck;
			if (deck !== null && deck.page === live.current.page) settle(deckOf(deck), deck.page);
			return true;
		},
		[deckOf, project, reads, settle],
	);

	const owns = useCallback(() => live.current.on, []);
	const presentKey = useCallback(
		(first: boolean) => {
			const { read: deck, page: on, project: of } = live.current;
			if (deck === undefined) return false;
			const state = store.get();
			const slides = deck.slides.map((slide) => slide.name);
			const slide = presentKeyFrom(slides, { frames: state.selected, elements: state.picked.length }, first);
			if (slide === undefined) return false;
			presentDeck({ project: of, page: on, slide });
			return true;
		},
		[store],
	);
	const talk = read?.size;
	const landing = aim?.aim?.landing ?? null;
	const lifted = aim?.aim?.band === true;
	const sending = pending !== null;
	const view = useMemo(
		() => ({ talk: talk ?? { w: 1280, h: 720 }, landing, lifted, sending }),
		[talk, landing, lifted, sending],
	);

	return { on, read, reads, numberOf, playOf, playTitleOf, hold, drop, cancel, walk, owns, presentKey, view };
}

/**
 * Under the frames of a deck page: the band behind the talk, and while a frame is held, the outline where it lands.
 * Nothing on any other page. The band goes while a frame is entered or a slide gone into (`inside`).
 */
export function DeckLayer({
	deck,
	inside,
	camera,
	store,
}: {
	deck: DeckPage;
	inside: boolean;
	camera: CameraStore;
	store: CanvasStore;
}) {
	const entered = useCanvasState(store, (state) => state.entered);
	if (!deck.on) return null;
	return (
		<>
			<Band
				camera={camera}
				talk={deck.view.talk}
				lifted={deck.view.lifted}
				sending={deck.view.sending}
				away={entered !== null || inside}
			/>
			<Landing camera={camera} landing={deck.view.landing} />
		</>
	);
}

/**
 * The band: one quiet surface behind the talk, the whole width of the canvas at any pan, from breathing room over
 * the slides' labels to the same room under the slides, so it runs past the last slide, which is where a frame joins
 * the end. It is the panel's surface on the canvas, with no edge of its own; held over, it lifts one hover step.
 */
function Band({
	camera,
	talk,
	lifted,
	sending,
	away,
}: {
	camera: CameraStore;
	talk: Size;
	lifted: boolean;
	sending: boolean;
	away: boolean;
}) {
	const band = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		(at) => {
			const el = band.current;
			if (el === null) return;
			const room = BAND_ROOM * at.k;
			el.style.top = `${at.y - LABEL - room}px`;
			el.style.height = `${talk.h * at.k + LABEL + room * 2}px`;
		},
		[talk.h],
	);
	return (
		<div
			ref={band}
			data-deck-band=""
			data-deck-sending={sending ? "" : undefined}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-x-0 bg-surface-panel transition-opacity duration-slow ease-out",
				away ? "opacity-0" : "opacity-100",
			)}
		>
			<div
				data-deck-lifted={lifted ? "" : undefined}
				className={cn(
					"absolute inset-0 bg-state-hover-raised transition-opacity duration-base ease-out",
					lifted ? "opacity-100" : "opacity-0",
				)}
			/>
		</div>
	);
}

/** Where the held frame will land: one quiet outline, gliding from slot to slot and cell to cell. */
function Landing({ camera, landing }: { camera: CameraStore; landing: Box | null }) {
	const outline = useRef<HTMLDivElement | null>(null);
	/** the box drawn now, in page pixels; it stays while the outline fades, and none once it has */
	const at = useRef<Box | null>(null);
	const frame = useRef(0);
	const { glide, snap } = useDeckMotion();
	const draw = useCallback(() => {
		const el = outline.current;
		const cam = camera.get();
		const box = at.current;
		if (el === null || cam === null || box === null) return;
		el.style.transform = `translate(${box.x * cam.k + cam.x}px, ${box.y * cam.k + cam.y}px)`;
		el.style.width = `${box.w * cam.k}px`;
		el.style.height = `${box.h * cam.k}px`;
	}, [camera]);
	useEffect(() => {
		if (landing === null) {
			// faded out, the next drag's outline starts where it lands rather than gliding from this one
			const timer = setTimeout(() => {
				at.current = null;
			}, glide);
			return () => clearTimeout(timer);
		}
		const from = at.current;
		if (from === null) {
			at.current = landing;
			draw();
			return;
		}
		const start = performance.now();
		const ease = easing(snap);
		const step = (now: number) => {
			const t = glide <= 0 ? 1 : Math.min(1, Math.max(0, (now - start) / glide));
			const k = ease(t);
			const mix = (a: number, b: number) => a + (b - a) * k;
			at.current = {
				x: mix(from.x, landing.x),
				y: mix(from.y, landing.y),
				w: mix(from.w, landing.w),
				h: mix(from.h, landing.h),
			};
			draw();
			frame.current = t < 1 ? requestAnimationFrame(step) : 0;
		};
		frame.current = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame.current);
	}, [landing, draw, glide, snap]);
	useCameraFollow(camera, draw, [draw]);
	return (
		<div
			ref={outline}
			data-deck-landing={landing === null ? undefined : ""}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute top-0 left-0 outline-1 outline-accent outline-solid transition-opacity duration-base ease-out",
				landing === null ? "opacity-0" : "opacity-70",
			)}
		/>
	);
}
