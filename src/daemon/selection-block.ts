import type { SelectionEntry } from "./selection";

/**
 * What the hands are pointing at, as one block of text (#116).
 *
 * There is one rendering of the selection and both readers get it: the block a
 * turn's prompt carries and the bytes `spool selection` prints are this function,
 * called twice. A chat turn and a CLI agent therefore read one contract rather
 * than two dialects of it, which is the whole reason this is a module and not a
 * template inside the turn.
 *
 * Which half is droppable is the law. A pointer — frame, noun, path, lines — is
 * the whole promise of the feature: nobody typed it, and the agent can read the
 * file itself from it. An excerpt is a convenience that saves one read. So every
 * entry always contributes its pointer and the excerpt is the only thing a budget
 * is ever allowed to take. Forty frames is forty short lines with nothing elided,
 * because a frame entry has no excerpt to begin with — the count that makes forty
 * frames a bad prompt is a fact about pointing, and the chip strip is where it is
 * admitted rather than here.
 *
 * What is dropped is stated. A block that quietly holds less than it appears to is
 * the one failure mode an agent cannot see and cannot ask about.
 */

/**
 * How many characters of excerpt one block may spend.
 *
 * The daemon caps every excerpt at 240 characters before it ever reaches here, so
 * this is roughly sixteen elements' worth of markup — well past any selection a
 * hand makes, and short of a prompt whose context outweighs its instruction.
 */
export const EXCERPT_BUDGET = 4000;

/** Nothing pointed at is an empty string: there is no block, so none is printed. */
export function selectionBlock(entries: readonly SelectionEntry[], budget = EXCERPT_BUDGET): string {
	if (entries.length === 0) return "";
	const lines: string[] = ["<selection>"];
	let spent = 0;
	let elided = 0;
	/*
	 * A prefix, not a best fit: excerpts ride in pick order until the budget runs out
	 * and then they stop. Squeezing a later short one in past a skipped long one buys
	 * an entry or two — they are all much of a size under one cap — and costs a rule
	 * anyone can hold in their head.
	 */
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
