/**
 * What the hands are pointing at — as the composer has to show it, and as the
 * prompt has to carry it. (#116)
 *
 * The daemon has always served a list: `SelectionEntry[]`, either all frames or
 * all elements, never mixed, in the order the human picked them. The rail has
 * only ever drawn the first one. This is the plural model, mirrored close enough
 * to `src/daemon/selection.ts` that the argument the frames make is an argument
 * about the real payload — frame entries carry no excerpt, element entries carry
 * one capped at 240 characters, and `id` is design-only because two picks of the
 * same list row are genuinely indistinguishable and React still needs a key.
 *
 * That last part is not a detail. It is the reason the strip below stops trying
 * to be a list of removable things past a certain width: `line-item · 44-56`
 * twice is two chips with two ✕ and no way to tell which is which. The canvas
 * knows — they are two boxes in two places — so removal belongs there.
 */

export interface FramePointed {
	readonly id: string;
	readonly kind: "frame";
	readonly frame: string;
	readonly path: string;
	readonly size: { readonly w: number; readonly h: number };
}

export interface ElementPointed {
	readonly id: string;
	readonly kind: "element";
	readonly frame: string;
	/** what spool calls it. Never unique: sibling rows of one list share it. */
	readonly name: string;
	readonly path: string;
	readonly lines: readonly [number, number];
	readonly selector: string;
	/** the daemon caps this at 240 characters before it ever reaches here */
	readonly excerpt: string;
}

export type Pointed = FramePointed | ElementPointed;

/** every entry names the same frame, so the chips need not repeat it */
export function sharesFrame(entries: readonly Pointed[]): boolean {
	const first = entries[0];
	if (first === undefined) return false;
	return entries.every((entry) => entry.frame === first.frame);
}

/**
 * One chip's words. A frame is its own name and nothing else — the name is the
 * identity, the path is derivable, the size is not something you point at. An
 * element is the noun and the lines, prefixed by its frame only when the
 * selection spans more than one.
 */
export function chipLabel(entry: Pointed, shared: boolean): string {
	if (entry.kind === "frame") return entry.frame;
	const lines = `${entry.lines[0]}-${entry.lines[1]}`;
	return shared ? `${entry.name} · ${lines}` : `${entry.frame} · ${entry.name} · ${lines}`;
}

/** what the collapsed chip says instead: a count, and the frame when there is one */
export function countLabel(entries: readonly Pointed[]): string {
	const noun = entries[0]?.kind === "frame" ? "frame" : "element";
	const count = `${entries.length} ${noun}${entries.length === 1 ? "" : "s"}`;
	if (entries[0]?.kind === "frame") return count;
	return sharesFrame(entries) ? `${count} in ${entries[0]?.frame}` : count;
}

/* ---------- the one-line rule ----------
 * The composer is for the prompt. Context rides in it, so context gets one line
 * of it and never a second: either every chip fits on that line, or the strip is
 * a count. There is no third shape — no `[cart] [menu] +6`, because two members
 * and a number is a list that has stopped being a list, and which two you get is
 * an accident of name length.
 *
 * Measured, not guessed: Fragment Mono at 11px is a hair over 6.6px a character,
 * and a chip is that plus its accent bar, its padding and its ✕. */

const CHAR_W = 6.6;
const CHIP_CHROME = 8 + 2 + 16 + 16;
const CHIP_GAP = 6;

export function chipWidth(label: string): number {
	return label.length * CHAR_W + CHIP_CHROME;
}

export interface Chip {
	readonly id: string;
	readonly label: string;
}

export type Strip =
	| { readonly kind: "none" }
	| { readonly kind: "chips"; readonly chips: readonly Chip[]; readonly entered?: EnteredChip }
	| { readonly kind: "count"; readonly label: string; readonly chips: readonly Chip[] };

/* ---------- the chip nobody chose (#139) ----------
 * `canvas.tsx:820` serves the entered frame when nothing is picked and nothing is
 * selected, so stepping inside a frame puts a chip in the composer that the human
 * never asked for. It is always exactly one frame: a pick outranks it, a canvas
 * selection outranks it, and any press outside the frame has already left it
 * (`canvas.tsx:1682`), so there is no state where this chip has a neighbour.
 *
 * Four ways to draw it, one per frame:
 *   drop    what the rail does today, undrawn until now: an ordinary chip, ✕ and
 *           all, where the ✕ is the only thing on screen that ejects you from the
 *           frame you are working inside.
 *   plain   the same chip with the ✕ gone, because entering is retracted by esc.
 *   quiet   dimmer than a picked chip, on the reading that a chip nobody chose is
 *           weaker evidence than one they did.
 *   said    the chip says why it is there — `inside cart` rather than `cart`.
 */
export type EnteredChip = "drop" | "plain" | "quiet" | "said";

/** `width` is the composer's inner width in px — 420 rail, less its two paddings */
export function stripOf(entries: readonly Pointed[], width: number, entered?: EnteredChip): Strip {
	const first = entries[0];
	if (first === undefined) return { kind: "none" };
	if (entered !== undefined) {
		// one frame, so the fit test has nothing to decide and the count is unreachable
		return { kind: "chips", chips: [{ id: first.id, label: enteredLabel(first, entered) }], entered };
	}
	// one chip has room to say where it is; a run of them only repeats it
	const shared = entries.length > 1 && sharesFrame(entries);
	const chips = entries.map((entry) => ({ id: entry.id, label: chipLabel(entry, shared) }));
	const laid = chips.reduce((sum, chip) => sum + chipWidth(chip.label), 0) + CHIP_GAP * (chips.length - 1);
	if (laid <= width) return { kind: "chips", chips };
	return { kind: "count", label: countLabel(entries), chips };
}

function enteredLabel(entry: Pointed, entered: EnteredChip): string {
	return entered === "said" ? `inside ${entry.frame}` : chipLabel(entry, false);
}

/**
 * The line the transcript keeps under the human's words. A sent turn is a
 * record, so it says exactly what the strip said at rest — no more, because the
 * strip is the promise that was made, and no less, because a turn nobody can
 * audit is a turn nobody can trust.
 */
export function contextLine(entries: readonly Pointed[], width: number, entered?: EnteredChip): string | undefined {
	const strip = stripOf(entries, width, entered);
	if (strip.kind === "none") return undefined;
	if (strip.kind === "count") return strip.label;
	return strip.chips.map((chip) => chip.label).join(", ");
}

/* ---------- what reaches the prompt ----------
 * One block, the same bytes `spool selection` would print for the same moment,
 * so a chat turn and a CLI agent are reading one contract rather than two
 * dialects of it.
 *
 * The law is which half is droppable. A pointer — frame, noun, path, lines — is
 * the whole promise of this feature: nobody typed it, and the agent can read the
 * file itself from it. An excerpt is a convenience that saves one Read. So every
 * entry always contributes its pointer, and the excerpt is the only thing a
 * budget is ever allowed to take. Forty frames is forty short lines and nothing
 * elided, because a frame entry has no excerpt to begin with — the count that
 * makes forty frames a bad prompt is a fact about pointing, not about bytes, and
 * the chip is where it is admitted rather than here.
 *
 * What is dropped is stated. A block that quietly holds less than it appears to
 * is the one failure mode an agent cannot see and cannot ask about. */

export const EXCERPT_BUDGET = 4000;

export function promptBlock(entries: readonly Pointed[], budget = EXCERPT_BUDGET): string {
	if (entries.length === 0) return "";
	const lines: string[] = ["<selection>"];
	let spent = 0;
	let elided = 0;
	// a prefix, not a best fit: excerpts ride in pick order until the budget runs
	// out and then they stop. Squeezing a later short one in past a skipped long
	// one buys an entry or two — the daemon caps every excerpt at 240, so they are
	// all much of a size — and costs a rule anyone can hold in their head
	let spending = true;
	for (const entry of entries) {
		if (entry.kind === "frame") {
			lines.push(`${entry.frame} — ${entry.path} — ${entry.size.w}×${entry.size.h}`);
			continue;
		}
		lines.push(`${entry.frame} · ${entry.name} — ${entry.path}:${entry.lines[0]}-${entry.lines[1]}`);
		if (spending && spent + entry.excerpt.length > budget) spending = false;
		if (!spending) {
			elided += 1;
			continue;
		}
		spent += entry.excerpt.length;
		lines.push(`  ${entry.excerpt}`);
	}
	if (elided > 0) lines.push(`  ${elided} excerpt${elided === 1 ? "" : "s"} elided over budget — read the paths`);
	lines.push("</selection>");
	return lines.join("\n");
}
