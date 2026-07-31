import type { Attachment } from "../../attachment";
import type { AgentWords } from "./agent-transcript";

/**
 * The queue spool holds while a turn is running (#170, #176).
 *
 * Spool holds it rather than the binary, on three counts. Take-back has no wire: an
 * interrupt is the only control that touches the binary's own queue and it kills the
 * turn along with it, so a list held over there could be cancelled but never edited.
 * Every adapter queues alike with no capability to detect. And the rail draws its own
 * state rather than a picture of another process's, which is the only kind of state a
 * surface can be accurate about.
 *
 * Everything here is a plain function of a list and a string. What the queue *is* —
 * words with the selection they were said against — is `AgentWords`, the same object
 * the log's head is made of, because a queued message becomes that row rather than
 * being replaced by one.
 */

/** one message spool is holding, with the id a take-back names it by */
export interface AgentQueued extends AgentWords {
	/**
	 * Its own id, which is the whole reason it has one: two identical messages are a
	 * real thing to type twice, and a ✕ has to reach exactly one of them.
	 */
	readonly id: string;
}

/**
 * The queue as it comes back off disk (#211).
 *
 * The floor under a file a person can open in an editor, and the same one `drawableEntries`
 * is: spool's store keeps the queue opaque because the vocabulary is up here, so this is
 * where the shape is checked rather than down there. A row missing the two fields that
 * make it a message — words to send and an id to take it back by — is dropped, because
 * both of its buttons would lie.
 */
export function drawableQueue(queued: readonly unknown[]): AgentQueued[] {
	return queued.filter((one): one is AgentQueued => {
		if (typeof one !== "object" || one === null) return false;
		const message = one as { id?: unknown; text?: unknown };
		return typeof message.id === "string" && typeof message.text === "string" && message.text !== "";
	});
}

/**
 * Messages that left the queue un-fired, waiting for the box to take them back.
 *
 * A signal rather than a value, which is why the count is here: whoever holds the
 * composer merges them in, and the climbing number is what says a fresh handover
 * happened rather than the same one being read twice. It has to be a signal because a
 * stop can arrive from the canvas, where the hands are watching a frame repaint and
 * the box is nowhere near the press.
 */
export interface AgentHandback {
	readonly count: number;
	/** in fire order, which is the order they land back in the field */
	readonly messages: readonly AgentQueued[];
}

/**
 * The blank line between two messages that came back as one blob.
 *
 * Two messages returning to one field are one string, so a stop that hands back two
 * and an Enter that follows sends one message where two were queued. That is not a
 * loss of meaning — the queue was going to fire them into one turn anyway — but it is
 * the one place the round trip is not reversible, and this is what leaves the seam
 * visible enough to split by hand.
 */
const SEAM = "\n\n";

/**
 * Words that left the queue un-fired, landing back in the box (#170).
 *
 * One invariant covers both exits, which is why there is one function: a stop cancels
 * the queue and hands every word back, and taking one back by hand is the same act
 * with the same outcome for the words involved.
 *
 * They land **above** whatever was already being written, in fire order, on two
 * counts that are not taste. The queue's order is the order these were going to be
 * said in, so appending would reverse a held message against the one being typed. And
 * the caret is mid-sentence: anything landing under it moves the words the hand is
 * on, where anything landing above leaves the tail of the box exactly where it was.
 */
export function handedBack(words: readonly string[], draft: string): string {
	const back = words.filter((text) => text !== "");
	if (back.length === 0) return draft;
	const returned = back.join(SEAM);
	return draft === "" ? returned : `${returned}${SEAM}${draft}`;
}

/**
 * Which of the words on their way home can carry what they were holding (#119, #234).
 *
 * The box has one slot for a reference and several messages may each have one, so a
 * handover of the whole queue has more pictures than there are places to put them. The
 * first in fire order takes the slot; the rest are not collapsed into the blob and are not
 * dropped either — they stay where they are, as their own rows, still holding what they
 * were holding.
 *
 * It is the words-and-reference pair that decides this rather than the words alone. Two
 * sentences returning as one string is a bounded loss the blank line makes visible and a
 * hand can undo. A picture is not: a browser never gave spool the path it came from, so a
 * dropped one cannot be got again from anywhere.
 */
export function handover(messages: readonly AgentQueued[]): {
	/** in fire order, which is the order they land back in the field */
	readonly back: readonly AgentQueued[];
	/** left in the box, because what they carry has nowhere to ride */
	readonly kept: readonly AgentQueued[];
} {
	const back: AgentQueued[] = [];
	const kept: AgentQueued[] = [];
	let slot = true;
	for (const one of messages) {
		const carrying = one.attached !== null && one.attached !== undefined;
		if (carrying && !slot) {
			kept.push(one);
			continue;
		}
		if (carrying) slot = false;
		back.push(one);
	}
	return { back, kept };
}

/**
 * The reference that comes home with those words (#119).
 *
 * A message carries at most one and the composer holds at most one, so a handover of
 * several has more references than there are slots to put them in. The first in fire
 * order takes the slot, and only when the box's own is empty — which is the caret's own
 * rule applied to the other half of the message: what the hand is holding now is not
 * moved by something arriving from the queue.
 *
 * The rest are dropped, and that is the same bounded loss the blank line already admits
 * for the words: several messages come back as one message, and one message has one
 * reference. Dropping the words' reference *silently* is what this exists to stop —
 * restored, it is a thumbnail in the box again and the hand can see what it has.
 */
export function handedBackReference(messages: readonly AgentQueued[], held: Attachment | null): Attachment | null {
	if (held !== null) return held;
	return messages.find((one) => one.attached !== null && one.attached !== undefined)?.attached ?? null;
}
