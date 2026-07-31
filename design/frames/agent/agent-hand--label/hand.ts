import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The rule, as code. Everything this direction claims is in `handOf` and it is
 * four sentences long.
 *
 * The label prints the live row's own words with the frame's name taken out,
 * because out here the name is the address rather than a word in the sentence.
 * `edit home ×6` in the rail is `edit ×6` on the frame called `home`. Nothing is
 * translated and no vocabulary is invented: `verbOf` below is `railEntries`'
 * count expression, character for character, so the two panes can never disagree.
 */

/**
 * The floor a word gets, in ms.
 *
 * Measured against the capture rather than picked: the twelve calls in
 * `claude-edits` run 186ms to 5.6s, and three of them are under 320ms. A word on
 * screen for 186ms is a flicker nobody reads, so a verb keeps the slot until its
 * call ends **or** until the floor is up, whichever is later.
 *
 * 600 rather than 700 because the tightest gap between the end of one call and
 * the start of the next in this capture is 741ms — so the floor has 141ms of
 * headroom and never has to be cut short here. It will be cut short in some other
 * turn, and the rule for that is the next one down: the floor yields, always.
 */
export const FLOOR = 600;

export interface Hand {
	/**
	 * The frame the agent is on: the one its most recent call named, held from that
	 * call until the turn stops running. This is presence, and it is the weaker of
	 * the two claims here — it says the agent is here, not that anything is
	 * happening this second.
	 */
	readonly frame: string | null;
	/**
	 * What is happening this second, on that frame, in the rail's own words. Null in
	 * the dead air between two calls, which is the whole reason `frame` is separate.
	 */
	readonly verb: string | null;
}

const NOBODY: Hand = { frame: null, verb: null };

/**
 * A run's count, exactly as `railEntries` builds it: bare below two, `×n` from two
 * up. It climbs on the capture's own child cues, so six writes land as six
 * separate facts rather than as one number that was true all along.
 *
 * The count takes no floor. It is not a new word, it is the same word getting
 * more accurate — and it could not have one anyway: the tightest gap between two
 * children of the six-write run is 593ms, which is under the floor.
 */
function verbOf(row: ToolRow, turn: Turn): string {
	if (!row.runs) return row.verb;
	const landed = row.children.filter((child) => turn.at(child.cue)).length;
	return landed > 1 ? `${row.verb} ×${landed}` : row.verb;
}

/**
 * Where the hand is and what it is doing, read off the same script the rail reads.
 *
 * **A row is skipped until its subject has landed.** A tool block opens with an
 * empty input and the file name arrives in the argument deltas, so for 78ms to
 * 274ms in this capture the rail can honestly draw `edit` with nothing after it
 * and the canvas cannot draw anything at all: out here the subject is the address,
 * and a verb with no address has nowhere to go. That lag is real and it is the
 * price of putting the report on the thing rather than in the list.
 *
 * **The turn ending clears everything, floor or no floor.** A settled turn with a
 * word still on a frame is two panes contradicting each other, and the rail is the
 * one telling the truth.
 */
export function handOf(script: Script, turn: Turn, elapsed: number): Hand {
	if (turn.phase !== "playing") return NOBODY;
	const at = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	let place: string | null = null;
	let slot: string | null = null;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame === null) continue;
		if (!turn.at(row.cue)) continue;
		// the address has not arrived yet, so neither has the row, as far as out here
		// is concerned
		if (row.subjectCue !== null && !turn.at(row.subjectCue)) continue;
		place = row.frame;
		const done = row.doneCue !== null && turn.at(row.doneCue);
		if (!done) {
			slot = verbOf(row, turn);
			continue;
		}
		// the floor, spent after the call rather than during it. This is the one
		// moment the label is not instantaneously true, it is bounded at 600ms, and
		// the alternative is a 186ms flash that reads as a rendering fault
		const ended = row.doneCue === null ? null : (at.get(row.doneCue) ?? null);
		slot = ended !== null && elapsed < ended + FLOOR ? verbOf(row, turn) : null;
	}
	return { frame: place, verb: slot };
}
