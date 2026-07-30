import type { SelectionEntry } from "../../daemon/selection";
import { pickKey } from "./protocol";

/**
 * What the hands are pointing at, as the composer has to show it (#116).
 *
 * The daemon has always served a list — every frame that is selected, or every
 * element in pick order — and the rail has only ever drawn the first one. This is
 * the plural model: it takes the daemon's own enriched entries, because the strip
 * is the promise of what the prompt will carry and only that side knows the paths,
 * the line ranges and the excerpts.
 *
 * The one rule it exists to hold: **the selection never takes more than one line of
 * the composer.** Either every chip fits on that line or the strip is a count that
 * opens into a droppable list. There is no third shape — no `[cart] [menu] +6` —
 * because two members and a number is a list that has stopped being a list, and
 * which two you get is an accident of how long their names happen to be.
 */

/**
 * The collapsed strip's own chip, which stands for the whole list rather than for
 * one member of it — so the cursor on it lights every box the list names.
 *
 * A selector can never be `*`, so nothing it could collide with reaches here.
 */
export const WHOLE_SELECTION = "*";

/** the strip's own word for one entry, which the canvas answers to as well */
export function idOf(entry: SelectionEntry): string {
	return entry.kind === "frame" ? entry.frame : pickKey(entry.frame, entry.selector);
}

/** every entry names the same frame, so the chips need not repeat it */
export function sharesFrame(entries: readonly SelectionEntry[]): boolean {
	const first = entries[0];
	if (first === undefined) return false;
	return entries.every((entry) => entry.frame === first.frame);
}

/**
 * One chip's words. A frame is its own name and nothing else — the name is the
 * identity, the path is derivable, and the size is not something you point at. An
 * element is the noun the source gave it and its lines, prefixed by its frame only
 * when the selection spans more than one.
 */
export function chipLabel(entry: SelectionEntry, shared: boolean): string {
	if (entry.kind === "frame") return entry.frame;
	const lines = `${entry.lines[0]}-${entry.lines[1]}`;
	return shared ? `${entry.name} · ${lines}` : `${entry.frame} · ${entry.name} · ${lines}`;
}

/** what the collapsed chip says instead: a count, and the frame when there is one */
export function countLabel(entries: readonly SelectionEntry[]): string {
	const first = entries[0];
	const noun = first?.kind === "frame" ? "frame" : "element";
	const count = `${entries.length} ${noun}${entries.length === 1 ? "" : "s"}`;
	if (first === undefined || first.kind === "frame") return count;
	return sharesFrame(entries) ? `${count} in ${first.frame}` : count;
}

/*
 * Measured, not guessed: Fragment Mono at 11px is a hair over 6.6px a character,
 * and a chip is that plus its accent bar, its padding and its ✕.
 */

const CHAR_W = 6.6;
const CHIP_CHROME = 8 + 2 + 16 + 16;
const CHIP_GAP = 6;

export function chipWidth(label: string): number {
	return label.length * CHAR_W + CHIP_CHROME;
}

/** the composer's inner width at a given rail width: less the panel's padding and the box's own */
export function composerWidth(rail: number): number {
	return rail - 28 - 24;
}

export interface Chip {
	readonly id: string;
	readonly label: string;
}

export type Strip =
	| { readonly kind: "none" }
	/** `inside` is the frame the hands stepped into, which is the one chip nobody chose (#139) */
	| { readonly kind: "chips"; readonly chips: readonly Chip[]; readonly inside: boolean }
	| { readonly kind: "count"; readonly label: string; readonly chips: readonly Chip[] };

/**
 * The strip, at whatever width the rail has been dragged to.
 *
 * `inside` marks the frame the hands are standing in rather than one they picked,
 * which the daemon serves when nothing is selected. It is always exactly one frame
 * — a pick outranks it, a selection outranks it, and any press outside the frame
 * has already left it — so the fit test has nothing to decide and the count is
 * unreachable from there.
 */
export function stripOf(entries: readonly SelectionEntry[], width: number, inside = false): Strip {
	const first = entries[0];
	if (first === undefined) return { kind: "none" };
	if (inside) return { kind: "chips", chips: [{ id: idOf(first), label: chipLabel(first, false) }], inside };
	// one chip has room to say where it is; a run of them only repeats it
	const shared = entries.length > 1 && sharesFrame(entries);
	const chips = entries.map((entry) => ({ id: idOf(entry), label: chipLabel(entry, shared) }));
	const laid = chips.reduce((sum, chip) => sum + chipWidth(chip.label), 0) + CHIP_GAP * (chips.length - 1);
	if (laid <= width) return { kind: "chips", chips, inside };
	return { kind: "count", label: countLabel(entries), chips };
}

/**
 * The line the transcript keeps under the human's words.
 *
 * A sent turn is a record, so it says exactly what the strip said at rest — no
 * more, because the strip is the promise that was made, and no less, because a turn
 * nobody can audit is a turn nobody can trust. It reads off the strip rather than
 * off the entries for that reason: a collapsed strip promised a count, so the
 * receipt is that count and not the list it was hiding.
 */
export function contextOf(strip: Strip): string | null {
	if (strip.kind === "none") return null;
	if (strip.kind === "count") return strip.label;
	return strip.chips.map((chip) => chip.label).join(", ");
}

export function contextLine(entries: readonly SelectionEntry[], width: number, inside = false): string | null {
	return contextOf(stripOf(entries, width, inside));
}
