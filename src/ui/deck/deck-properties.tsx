import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Size } from "../../deck/deck-file";
import { cellNear, colStride, rowStride } from "../../deck/layout";
import type { DeckChange, DeckSlide } from "../../deck/wire";
import { pageName, pageParent } from "../../page-path";
import type { Geometry } from "../api";
import { NumField, Row } from "../canvas/rail-fields";
import { NumberField, TextareaBare } from "../primitives/inputs";
import { Section } from "../primitives/structure";
import { changeDeck, type DeckEntry, type DeckReads, useDeckRead } from "./deck-api";
import { folderOf } from "./deck-drag";

/**
 * A deck page's frame in Properties (spool#265, the team canvas's `app/spool-deck`). Its place is the deck's, so the
 * position section says `grid`: a slide's place is its slot and cannot be typed, and a place typed for a loose frame
 * goes to the cell nearest it. A slide's size is the talk's, so its section says `all slides` and a size typed there
 * is every slide's; a loose frame's size is its own, as on any page. A slide has a `notes` section under them, one
 * field per beat, named by the beat, written to its `notes.md` when the field is left.
 */

export interface DeckPropertiesKit {
	readonly project: string;
	/** the project's deck reads, the canvas's own; none with the experiment off */
	readonly reads: DeckReads | null;
	/** record one undo entry */
	readonly record: (entry: DeckEntry) => void;
	/** say why a change was refused */
	readonly say: (message: string) => void;
}

/**
 * A frame's place and size in Properties: the deck's sections on a deck page, `ordinary` (the rail's own, or one of
 * its two sections) on any other.
 */
export function DeckFrameSections({
	kit,
	name,
	geometry,
	ordinary,
}: {
	kit: DeckPropertiesKit;
	name: string;
	geometry: Geometry;
	ordinary: (only?: "size") => ReactNode;
}) {
	const page = pageParent(name);
	const deck = useDeckRead(kit.reads, page);
	if (deck === undefined) return ordinary();
	const slide = deck.slides.some((one) => one.name === name);
	return (
		<>
			<Position key={`position:${name}`} kit={kit} page={page} name={name} geometry={geometry} />
			{slide ? <TalkSize kit={kit} page={page} /> : ordinary("size")}
			{slide ? <Notes key={`notes:${name}`} kit={kit} page={page} name={name} /> : null}
		</>
	);
}

/** Send one change; its entry goes on the undo stack, its refusal is said. */
async function send(kit: DeckPropertiesKit, change: DeckChange): Promise<void> {
	if (kit.reads === null) return;
	const sent = await changeDeck(kit.project, kit.reads, change);
	if (sent.kind === "refused") kit.say(sent.message);
	else if (sent.entry !== undefined) kit.record(sent.entry);
}

const AXES = ["x", "y"] as const;

function Position({
	kit,
	page,
	name,
	geometry,
}: {
	kit: DeckPropertiesKit;
	page: string;
	name: string;
	geometry: Geometry;
}) {
	const deck = useDeckRead(kit.reads, page);
	const spot = deck?.loose.find((one) => one.name === name);
	/** the cell nearest where a loose frame would stand at `x`, `y`, and the frame sent there when it is another */
	const go = (talk: Size, x: number, y: number) => {
		if (spot === undefined) return;
		const cell = cellNear(talk, x + geometry.w / 2, y + geometry.h / 2);
		if (cell.col === spot.cell.col && cell.row === spot.cell.row) return;
		void send(kit, { kind: "place", page, frames: [folderOf(page, name)], cell });
	};
	return (
		<Section title="position" meta="grid" data-deck-position="">
			{AXES.map((axis) => (
				<Row key={axis} name={axis}>
					{deck === undefined || spot === undefined ? (
						// a slide stands in its slot: its place is read here and set by the talk's order
						<NumberField
							className="flex-1"
							value={Math.round(geometry[axis])}
							unit="px"
							onStep={() => {}}
							inputProps={{ readOnly: true, "aria-readonly": true, tabIndex: -1 }}
						/>
					) : (
						<NumField
							value={Math.round(geometry[axis])}
							readout="px"
							onCommit={(typed) =>
								go(deck.size, axis === "x" ? typed : geometry.x, axis === "y" ? typed : geometry.y)
							}
							// a step is a cell: anything less would land back where it was
							onStep={(units) => {
								const by = Math.sign(units) * (axis === "x" ? colStride(deck.size) : rowStride(deck.size));
								go(deck.size, geometry.x + (axis === "x" ? by : 0), geometry.y + (axis === "y" ? by : 0));
							}}
						/>
					)}
				</Row>
			))}
		</Section>
	);
}

function TalkSize({ kit, page }: { kit: DeckPropertiesKit; page: string }) {
	const deck = useDeckRead(kit.reads, page);
	if (deck === undefined) return null;
	const set = (axis: "w" | "h", value: number) => {
		const size = { ...deck.size, [axis]: Math.trunc(value) };
		if (size.w === deck.size.w && size.h === deck.size.h) return;
		void send(kit, { kind: "size", page, size });
	};
	return (
		<Section title="size" meta="all slides" data-deck-size="">
			{(["w", "h"] as const).map((axis) => (
				<Row key={axis} name={axis}>
					<NumField
						value={deck.size[axis]}
						readout="px"
						onCommit={(typed) => set(axis, typed)}
						onStep={(units) => set(axis, deck.size[axis] + units * 4)}
					/>
				</Row>
			))}
		</Section>
	);
}

/** The slide's notes, one Properties section: one paragraph per beat its code names. */
function Notes({ kit, page, name }: { kit: DeckPropertiesKit; page: string; name: string }) {
	const deck = useDeckRead(kit.reads, page);
	const slide = deck?.slides.find((one) => one.name === name);
	if (deck === undefined || slide === undefined) return null;
	const beats = beatsOf(slide);
	return (
		<Section title="notes" meta="notes.md" data-deck-notes="">
			<div className="flex animate-chrome-in flex-col gap-3 px-3 pt-1 pb-4">
				{beats.map((beat, index) => (
					<div key={beat}>
						{beats.length > 1 ? (
							<div className="flex h-5 items-center gap-2 text-tertiary type-detail">
								<span className="tabular-nums">{index + 1}</span>
								<span>{beat}</span>
							</div>
						) : null}
						<BeatNote
							words={slide.notes[index] ?? ""}
							label={`Notes for ${pageName(name)}, ${beat}`}
							onSave={(text) =>
								void send(kit, { kind: "notes", page, frame: folderOf(page, name), beat: index, text })
							}
						/>
					</div>
				))}
			</div>
		</Section>
	);
}

/** A slide's beats by name; a slide naming none plays as one. */
function beatsOf(slide: DeckSlide): readonly string[] {
	return slide.beats.length > 0 ? slide.beats : [pageName(slide.name)];
}

/** A note's typed words written once: the blur and the click of one press are one write. */
function writeNote(live: { draft: string | null; words: string; onSave: (text: string) => void }): void {
	if (live.draft !== null && live.draft !== live.words) live.onSave(live.draft);
	live.draft = null;
}

/**
 * One beat's words. What is typed is the field's own until it is left, which writes it once, as one undo entry; while
 * nobody is typing the field follows the file, so an agent's words arrive in it.
 */
function BeatNote({ words, label, onSave }: { words: string; label: string; onSave: (text: string) => void }) {
	const [draft, setDraft] = useState<string | null>(null);
	const field = useRef<HTMLTextAreaElement>(null);
	const live = useRef({ draft, words, onSave });
	live.current = { draft, words, onSave };
	// written however the words are left: taken away (another frame picked), the window going, or a press elsewhere that
	// moves no focus, as an accessibility press does
	useEffect(() => {
		const write = () => writeNote(live.current);
		const away = (event: Event) => {
			if (event.target instanceof Node && field.current?.contains(event.target)) return;
			write();
		};
		document.addEventListener("click", away, true);
		window.addEventListener("pagehide", write);
		return () => {
			document.removeEventListener("click", away, true);
			window.removeEventListener("pagehide", write);
			write();
		};
	}, []);
	const leave = () => {
		writeNote(live.current);
		setDraft(null);
	};
	return (
		<TextareaBare
			ref={field}
			rows={1}
			value={draft ?? words}
			onValueChange={setDraft}
			onFocus={() => setDraft(words)}
			onBlur={leave}
			// the canvas's own keys stay out of words being typed
			onKeyDown={(event) => event.stopPropagation()}
			placeholder="What you'll say here"
			aria-label={label}
			data-deck-note=""
		/>
	);
}
