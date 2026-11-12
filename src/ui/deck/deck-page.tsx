import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { readingOrder } from "../../deck/changes";
import type { Size } from "../../deck/deck-file";
import { type Deck, placesOf } from "../../deck/layout";
import type { DeckRead } from "../../deck/wire";
import { type Box, nudgeCamera, toWorld } from "../canvas/camera";
import type { CameraStore } from "../canvas/camera-store";
import { useCameraFollow } from "../canvas/camera-store";
import { type CanvasStore, useCanvasState } from "../canvas/canvas-store";
import type { FrameMotion } from "../canvas/frame-motion";
import { cn } from "../cn";
import { changeDeck, type DeckEntry, type DeckReads, useDeckRead, useDeckReads, walkDeck } from "./deck-api";
import {
	type Aim,
	aimOf,
	BAND_ROOM,
	bandReach,
	deckOfRead,
	edgePan,
	folderOf,
	type Lean,
	leanOf,
	nameOf,
	takeHold,
} from "./deck-drag";
import { createFrameSprings, deckMotion, easing, type FrameSprings, type Point } from "./deck-motion";
import { type PresentFrom, presentDeck, presentKeyFrom } from "./present";
import type { PresentHow } from "./present-way";

/**
 * The deck page on the canvas (spool#265, the team canvas's `app/spool-deck`): what the canvas asks of a page that
 * is a deck. On one the canvas's own snapping, guides and resize handles stand down, and the deck's stand instead,
 * the Dock's way (spool#299): the frame taken lifts into the hand and follows it, the band closes over the hole it
 * left and opens one gap where letting go would put it, and letting go lands it there and sends the one deck change
 * that does it. Nothing says what will happen: the gap is the whole message. The window previews; the daemon decides
 * and writes the places, which arrive as the same numbers.
 *
 * Everything that moves with the hand moves outside React (`createFrameSprings`): the hand and the springs run each
 * animation frame and draw the frames where they have them. React hears only when where letting go would land changes,
 * a handful of times a drag, for the slides' numbers.
 *
 * `useDeckPage` is the whole of it for the canvas; `DeckLayer` draws the band under the frames, `DeckNumbers` the
 * slides' numbers at their slots, and `DeckLift` the shadow under a frame in the hand.
 */

/** A frame's name label over it, in screen pixels: the band reaches over it. */
const LABEL = 28;
/** What a slide's play says it does. */
const PRESENT_TITLE = "Present from here ⌘↵";
/** After the band last scrolled, the frames keep making room on the quicker spring this long, in ms. */
const RUSHING = 250;
/** The hand's speed is read over its last moves this long, in ms; a hand still for longer than `STOPPED` has none. */
const SAMPLED = 90;
const STOPPED = 80;
/** The fastest a frame let go carries on, in screen pixels a second: never a wild fling. */
const FLING = 4000;
/** How far inside the view's edge a frame chosen off it comes, in screen pixels. */
const REVEAL = 48;

/** A frame chosen in Pages or by the arrows on a deck page comes just inside the view's edge, if it is not in already. */
export function revealOnDeck(camera: CameraStore, box: Box, vw: number, vh: number): void {
	const at = camera.get();
	if (at === null) return;
	const next = nudgeCamera(at, box, vw, vh, REVEAL);
	if (next === at) return;
	const { reveal, snap } = deckMotion();
	camera.fly(next, reveal, easing(snap));
}

/** A slide's number where it stands: at its slot, in the talk as it is shown. */
export interface SlotNumber {
	/** the slide at the slot, by path */
	readonly name: string;
	readonly number: number;
	/** the top left of the slide at the slot, on the page */
	readonly at: Point;
}

export interface DeckPage {
	/** The page in front is a deck, and the deck's rules hold on it. */
	readonly on: boolean;
	/** Whether the project's decks have been read once, or there are none to read: until then no page is known for one. */
	readonly known: boolean;
	/** The page's deck as last read, while it is one. */
	readonly read: DeckRead | undefined;
	/** The project's deck reads, for whatever else shows a deck (the Pages rail, Properties). */
	readonly reads: DeckReads | null;
	/** Where the deck's frames are drawn while they move: what draws a frame draws it there. */
	readonly motion: FrameMotion;
	/** The number a slide carries before its name, from 1, in the talk as shown; none for a loose frame. */
	numberOf(name: string): number | undefined;
	/** Whether a slide's number stands at its slot rather than in its label: every slide's but one carried. */
	numberAside(name: string): boolean;
	/**
	 * What a frame's play does: a slide's presents from it, any other frame's is `play`, and a frame held has none.
	 * The functions handed back are the same ones for the page's life, so a label is not drawn again for them.
	 */
	playOf(name: string, play: (name: string) => void): ((name: string) => void) | undefined;
	/** What a frame's play says it does, where that is not playing it. */
	playTitleOf(name: string): string | undefined;
	/**
	 * Frames held on the page moved: `origins` where each stood as the drag began, `pointer` where the hand is in the
	 * view, `start` where it was pressed on the page. False when the deck has nothing to say about them (the page is
	 * no deck), and the canvas moves them its own way.
	 */
	hold(origins: ReadonlyMap<string, Point>, pointer: Point, start: Point): boolean;
	/** Let go: lands what is held and sends the change the drop makes. False when no deck drag was going on. */
	drop(): boolean;
	/** The drag ended without a drop (escaped, or carried off to another page): everything back to its place. */
	cancel(): void;
	/**
	 * Frames as a read of the disk has them, with the deck's own where it has settled them and the daemon has not
	 * written them yet: a read never shows a frame back where it was before it goes on.
	 */
	keep<F extends { name: string; x: number; y: number; w: number; h: number }>(read: readonly F[]): F[];
	/** Run a deck entry of the undo stack back or forward. False when the daemon refused it as stale. */
	walk(entry: DeckEntry, way: "undo" | "redo"): Promise<boolean>;
	/** Whether the page in front is a deck, read when called: for handlers made before the deck was read. */
	owns(): boolean;
	/**
	 * ⌘↵ (`first` false) or ⇧⌘↵ (`first` true) on the page, and ⌥⌘↵ (`how` "other"): presents from the slide held, or
	 * the first. False when the key is not the deck's (the page is no deck, or what is held is no one slide), and the
	 * canvas's own key stands.
	 */
	presentKey(first: boolean, how?: PresentHow): boolean;
	/** Where Present on the canvas plays from: the slide held, else the first; undefined on a page that is no deck. */
	presentFrom(): PresentFrom | undefined;
	/**
	 * What the layers draw: the talk's size; whether what is held is over the band, which lifts it; `sending`, a
	 * drop's change is out and its undo entry not yet in; the slides' numbers at their slots; and the frames carried,
	 * in the hand or landing, which carry their own.
	 */
	readonly view: {
		readonly talk: Size;
		readonly lifted: boolean;
		readonly sending: boolean;
		readonly numbers: readonly SlotNumber[];
		readonly carried: ReadonlySet<string>;
	};
}

/** A drag on the deck page, from the press to letting go. */
interface Holding {
	readonly page: string;
	/** the deck as the drag began, which every aim is decided against */
	readonly base: Deck;
	/** what is held, by folder, in the order it is read on the page */
	readonly frames: readonly string[];
	/** the frame under the hand, by folder, and by path */
	readonly grabbed: string;
	readonly grabbedName: string;
	readonly origins: ReadonlyMap<string, Point>;
	/** the point the hand has the grabbed frame by, from its top left, on the page */
	readonly grab: Point;
	/** where the hand is in the view */
	pointer: Point;
	samples: { t: number; x: number; y: number }[];
	lean: Lean;
	aim: Aim | null;
	key: string;
	/** when the band last scrolled under the hand */
	scrolled: number;
}

/** What React draws of a drag: the deck shown, the frames carried, and whether the band holds what is held. */
interface Shown {
	readonly deck: Deck | null;
	readonly carried: ReadonlySet<string>;
	readonly band: boolean;
}

const NOTHING: Shown = { deck: null, carried: new Set(), band: false };
const NO_READS = () => () => {};

export function useDeckPage({
	project,
	page,
	store,
	camera,
	viewport,
	record,
	say,
}: {
	project: string;
	/** the page in front */
	page: string;
	store: CanvasStore;
	camera: CameraStore;
	/** the view's size in CSS pixels, as last measured */
	viewport: () => { width: number; height: number };
	/** record one undo entry */
	record: (entry: DeckEntry) => void;
	/** say why a change was refused */
	say: (message: string) => void;
}): DeckPage {
	const hands = useRef({ record, say, viewport });
	hands.current = { record, say, viewport };
	const reads = useDeckReads(project);
	const read = useDeckRead(reads, page);
	const on = read !== undefined;
	const known = useSyncExternalStore(reads?.subscribe ?? NO_READS, () => reads === null || reads.get() !== null);
	const live = useRef<{
		read: DeckRead | undefined;
		page: string;
		on: boolean;
		project: string;
		pending: Deck | null;
	}>({
		read,
		page,
		on,
		project,
		pending: null,
	});
	const springs = useMemo<FrameSprings>(() => createFrameSprings(store, () => camera.get()?.k ?? 1), [store, camera]);
	useEffect(() => () => springs.stop(), [springs]);
	// another page in front: nothing of this one is drawn anywhere it moved to
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page changing is what stops them
	useLayoutEffect(() => springs.stop(), [springs, page]);
	const holding = useRef<Holding | null>(null);
	const [shown, setShown] = useState<Shown>(NOTHING);
	// the talk as a drop left it, until the daemon's answer says so too
	const [pending, setPending] = useState<Deck | null>(null);
	live.current = { read, page, on, project, pending };

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
	/** Every frame of a deck at its place, by path, but those named in `except`. */
	const placesBy = useCallback((deck: Deck, on: string, except: ReadonlySet<string> = new Set()) => {
		const goals = new Map<string, Point>();
		for (const [folder, box] of placesOf(deck)) {
			const name = nameOf(on, folder);
			if (!except.has(name)) goals.set(name, { x: box.x, y: box.y });
		}
		return goals;
	}, []);

	const readDeck = useMemo(() => (read === undefined ? null : deckOf(read)), [read, deckOf]);
	const deck = shown.deck ?? pending ?? readDeck;
	const numbers = useMemo(() => {
		if (deck === null) return [];
		const places = placesOf(deck);
		return deck.line.map((folder, index) => {
			const box = places.get(folder);
			return { name: nameOf(page, folder), number: index + 1, at: { x: box?.x ?? 0, y: box?.y ?? 0 } };
		});
	}, [deck, page]);
	const numberBy = useMemo(() => new Map(numbers.map((one) => [one.name, one.number])), [numbers]);
	const numberOf = useCallback((name: string) => numberBy.get(name), [numberBy]);
	const numberAside = useCallback((name: string) => !shown.carried.has(name), [shown.carried]);
	const present = useCallback((name: string) => presentDeck({ project, page, slide: name }), [project, page]);
	const playOf = useCallback(
		(name: string, play: (name: string) => void) =>
			shown.carried.has(name) ? undefined : numberBy.has(name) ? present : play,
		[numberBy, shown.carried, present],
	);
	const playTitleOf = useCallback((name: string) => (numberBy.has(name) ? PRESENT_TITLE : undefined), [numberBy]);

	/** Each animation frame of a drag: where the held frames are, and what letting go would do. */
	const steer = useCallback(
		(held: Holding) => {
			const at = camera.get();
			if (at === null) return;
			const hand = toWorld(held.pointer, at);
			const top = { x: hand.x - held.grab.x, y: hand.y - held.grab.y };
			const from = held.origins.get(held.grabbedName) ?? top;
			const placed = new Map<string, Point>();
			for (const [name, origin] of held.origins)
				placed.set(name, { x: origin.x + top.x - from.x, y: origin.y + top.y - from.y });
			springs.hold(placed, hand);
			const size = held.base.sizes[held.grabbed] ?? held.base.talk;
			const middle = top.x + size.w / 2;
			// the way the hand goes is measured on the page: the band scrolling under a still hand moves it too
			held.lean = leanOf(held.lean, middle, at.k);
			const next = aimOf(
				held.base,
				{ frames: held.frames, grabbed: held.grabbed, at: top, dir: held.lean.dir },
				at.k,
				held.aim,
			);
			const key = next === null ? "" : JSON.stringify(next.rule);
			if (key === held.key && held.aim !== null) return;
			held.aim = next;
			held.key = key;
			const names = new Set(held.origins.keys());
			const preview = next?.deck ?? held.base;
			springs.place(
				placesBy(preview, held.page, names),
				performance.now() - held.scrolled < RUSHING ? "rush" : "room",
			);
			setShown({ deck: preview, carried: names, band: next?.gap != null });
		},
		[camera, springs, placesBy],
	);

	/** After each animation frame of a drag: held near the view's side, the band scrolls towards that end. */
	const scroll = useCallback(
		(held: Holding, dt: number) => {
			const at = camera.get();
			if (at === null) return;
			const { width } = hands.current.viewport();
			const shownDeck = held.aim?.deck ?? held.base;
			const x = edgePan({
				pointer: held.pointer.x,
				width,
				camera: at,
				talk: held.base.talk,
				reach: bandReach(held.base.talk, shownDeck.line.length),
				dt,
			});
			if (x === at.x) return;
			camera.set({ ...at, x });
			held.scrolled = performance.now();
		},
		[camera],
	);

	const hold = useCallback(
		(origins: ReadonlyMap<string, Point>, pointer: Point, start: Point) => {
			const { read: deck, page: on, pending: sent } = live.current;
			if (deck === undefined) return false;
			let held = holding.current;
			if (held === null) {
				// the talk as shown: a drop's own until the daemon's answer says so too
				const base = sent ?? deckOf(deck);
				const taken = takeHold(base, on, origins, springs.drawn, start);
				if (taken === null) return false;
				held = {
					page: on,
					base,
					frames: readingOrder(
						base,
						[...taken.origins.keys()].map((name) => folderOf(on, name)),
					),
					grabbed: folderOf(on, taken.grabbed),
					grabbedName: taken.grabbed,
					origins: taken.origins,
					grab: taken.grab,
					pointer,
					samples: [],
					lean: taken.lean,
					aim: null,
					key: "",
					scrolled: Number.NEGATIVE_INFINITY,
				};
				holding.current = held;
				const one = held;
				springs.steer({ frame: () => steer(one), after: (dt) => scroll(one, dt) });
			}
			held.pointer = pointer;
			const t = performance.now();
			held.samples.push({ t, x: pointer.x, y: pointer.y });
			while (held.samples.length > 2 && t - (held.samples[0]?.t ?? t) > SAMPLED) held.samples.shift();
			return true;
		},
		[deckOf, springs, steer, scroll],
	);

	/** The hand's speed as it let go, in page pixels a second: none once it had stopped. */
	const velocity = useCallback(
		(held: Holding): Point => {
			const a = held.samples[0];
			const b = held.samples.at(-1);
			const k = camera.get()?.k ?? 1;
			if (a === undefined || b === undefined || b.t - a.t < 8 || performance.now() - b.t > STOPPED)
				return { x: 0, y: 0 };
			const clamp = (n: number) => Math.max(-FLING, Math.min(FLING, n));
			return {
				x: clamp(((b.x - a.x) / (b.t - a.t)) * 1000) / k,
				y: clamp(((b.y - a.y) / (b.t - a.t)) * 1000) / k,
			};
		},
		[camera],
	);

	/** What is held lands on `deck`'s places, and every other frame goes to its own. */
	const land = useCallback(
		(held: Holding, deck: Deck) => {
			springs.steer(null);
			const names = new Set(held.origins.keys());
			setShown({ deck: null, carried: names, band: false });
			springs.settle(placesBy(deck, held.page), velocity(held), () =>
				setShown((now) => (now.deck === null ? NOTHING : now)),
			);
		},
		[springs, placesBy, velocity],
	);

	const cancel = useCallback(() => {
		const held = holding.current;
		holding.current = null;
		if (held !== null) land(held, held.base);
	}, [land]);

	const drop = useCallback(() => {
		const held = holding.current;
		if (held === null) return false;
		holding.current = null;
		// what the hand did since the last frame was drawn counts: it lands from where the hand let go
		steer(held);
		const aimed = held.aim;
		const deckReads = reads;
		if (aimed === null || aimed.same || deckReads === null) {
			land(held, held.base);
			return true;
		}
		setPending(aimed.deck);
		land(held, aimed.deck);
		const on = held.page;
		void changeDeck(project, deckReads, { ...aimed.rule, page: on }).then((sent) => {
			setPending(null);
			if (sent.kind === "refused") {
				hands.current.say(sent.message);
				const now = deckReads.deckOf(on);
				springs.settle(placesBy(now === undefined ? held.base : deckOf(now), on));
				return;
			}
			if (sent.entry !== undefined) hands.current.record(sent.entry);
		});
		return true;
	}, [deckOf, project, reads, land, springs, placesBy, steer]);

	const walk = useCallback(
		async (entry: DeckEntry, way: "undo" | "redo") => {
			if (reads === null) return false;
			const was = reads.deckOf(entry.page)?.size;
			const sent = await walkDeck(project, reads, entry, way);
			if (sent.kind === "refused") return false;
			const deck = sent.answer.deck;
			if (deck === null || deck.page !== live.current.page) return true;
			// a talk of another size takes its frames to other sizes, which only the daemon's read of them has
			if (was === undefined || was.w !== deck.size.w || was.h !== deck.size.h) springs.stop();
			else springs.settle(placesBy(deckOf(deck), deck.page));
			return true;
		},
		[deckOf, project, reads, springs, placesBy],
	);

	const keep = useCallback(
		<F extends { name: string; x: number; y: number; w: number; h: number }>(read: readonly F[]) =>
			springs.keep(read),
		[springs],
	);
	const owns = useCallback(() => live.current.on, []);
	const presentKey = useCallback(
		(first: boolean, how: PresentHow = "present") => {
			const { read: deck, page: on, project: of } = live.current;
			if (deck === undefined) return false;
			const state = store.get();
			const slides = deck.slides.map((slide) => slide.name);
			const slide = presentKeyFrom(slides, { frames: state.selected, elements: state.picked.length }, first);
			if (slide === undefined) return false;
			presentDeck({ project: of, page: on, slide }, how);
			return true;
		},
		[store],
	);
	const presentFrom = useCallback((): PresentFrom | undefined => {
		const { read: deck, page: on, project: of } = live.current;
		if (deck === undefined) return undefined;
		const state = store.get();
		const slides = deck.slides.map((slide) => slide.name);
		const slide =
			presentKeyFrom(slides, { frames: state.selected, elements: state.picked.length }, false) ?? slides[0];
		return slide === undefined ? undefined : { project: of, page: on, slide };
	}, [store]);
	const talk = read?.size;
	const sending = pending !== null;
	const view = useMemo(
		() => ({
			talk: talk ?? { w: 1280, h: 720 },
			lifted: shown.band,
			sending,
			numbers,
			carried: shown.carried,
		}),
		[talk, shown, sending, numbers],
	);

	return {
		on,
		known,
		read,
		reads,
		motion: springs,
		numberOf,
		numberAside,
		playOf,
		playTitleOf,
		hold,
		drop,
		cancel,
		keep,
		walk,
		owns,
		presentKey,
		presentFrom,
		view,
	};
}

/**
 * Under the frames of a deck page: the band behind the talk. Nothing on any other page. The band goes while a frame
 * is entered or a slide gone into (`inside`).
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
		<Band
			camera={camera}
			talk={deck.view.talk}
			lifted={deck.view.lifted}
			sending={deck.view.sending}
			away={entered !== null || inside}
		/>
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

/**
 * The slides' numbers, in the labels' field (spool#299): a number belongs to its slot, so a slide that moves along
 * the talk slides out from under one number and in under the next, and a slide carried in the hand or landing carries
 * its own in its label while the number at its slot stands aside. They change hands where they stand, at once; while
 * the gap moves, a slot's number fades in or out.
 */
export function DeckNumbers({
	deck,
	camera,
	store,
	inside,
}: {
	deck: DeckPage;
	camera: CameraStore;
	store: CanvasStore;
	/** the slide gone into, whose chip carries its number */
	inside: string | null;
}) {
	const selected = useCanvasState(store, (state) => state.selected);
	const entered = useCanvasState(store, (state) => state.entered);
	const { carried, numbers } = deck.view;
	// lifted and set down, the number changes hands where it stands, at once
	const was = useRef<ReadonlySet<string>>(carried);
	const handing = carried.size === 0 || was.current.size === 0 ? new Set([...carried, ...was.current]) : new Set();
	useEffect(() => {
		was.current = carried;
	}, [carried]);
	if (!deck.on) return null;
	return (
		<>
			{numbers.map((slot, index) => (
				<SlotMark
					// a number belongs to its slot, whichever slide stands there
					// biome-ignore lint/suspicious/noArrayIndexKey: the slot is the number's identity
					key={index}
					slot={slot}
					camera={camera}
					selected={selected.includes(slot.name)}
					aside={carried.has(slot.name) || entered === slot.name || inside === slot.name}
					instant={handing.has(slot.name)}
				/>
			))}
		</>
	);
}

function SlotMark({
	slot,
	camera,
	selected,
	aside,
	instant,
}: {
	slot: SlotNumber;
	camera: CameraStore;
	selected: boolean;
	aside: boolean;
	instant: boolean;
}) {
	const place = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		(at) => {
			if (place.current !== null)
				place.current.style.transform = `translate(${slot.at.x * at.k}px, ${slot.at.y * at.k}px)`;
		},
		[slot.at.x, slot.at.y],
	);
	// the label's own row, so the number stands exactly where the label keeps its room
	return (
		<div ref={place} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-0">
			<div className="absolute bottom-full left-0 flex items-center gap-1.5 whitespace-nowrap pb-2.5">
				<span
					data-slot-number={slot.number}
					data-slot-of={slot.name}
					data-aside={aside ? "" : undefined}
					className={cn(
						"shrink-0 tabular-nums type-value",
						instant ? "transition-colors" : "transition-[color,opacity]",
						"duration-base ease-out",
						selected ? "text-accent-strong" : "text-tertiary",
						aside ? "opacity-0" : "opacity-100",
					)}
				>
					{slot.number}
				</span>
			</div>
		</div>
	);
}
