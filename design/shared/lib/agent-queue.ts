import { useEffect, useRef, useState } from "react";
import type { PlayEntry, Queued, TurnPhase } from "shared/lib/turn-play";

/**
 * The queue's own state, so the placement frames differ by one word (#176).
 *
 * Spool holds the queue rather than the binary (#170), which is why none of this
 * comes out of a capture: no recording in this repo has a queue in it, because the
 * composer refused every keystroke while a turn ran until #170 said it should not.
 * So the list is the frame's, the ids are the frame's, and the only thing the turn
 * contributes is the moment it ends.
 *
 * **Firing is the whole comparison, and it is what the first two frames could not
 * show.** `--queue-tail` and `--queue-band` were parked mid-turn and stayed parked,
 * so the queue waited forever and the moment the placements actually disagree about
 * never arrived. They disagree about *motion*: in the tail the row is already
 * standing where its receipt lands, so firing is an undim in place; everywhere else
 * the row leaves one surface and reappears in another. Neither is arguable from a
 * still, so the turn plays to its end here and the queue goes out when it does.
 *
 * What fires is every waiting message at once, in order, because #170 settled that
 * they go down stdin together and the binary runs one turn over all of them. They
 * land as ordinary user rows — undimmed, no marker, nothing taken back any more —
 * which is the point: a queued row *becomes* the receipt rather than being replaced
 * by one.
 *
 * What this deliberately does not draw is the turn that follows. In the product the
 * fired messages start one; here the capture has ended and the composer offers its
 * own `replay`. The placement question is settled by watching the rows cross, and
 * the turn on the far side of them is #114's to play, not this ticket's.
 */
export function useQueue(
	seed: readonly Queued[],
	phase: TurnPhase,
	/** what was already half-written in the composer when the frame opened */
	writing = "",
): {
	/** what is still waiting, in fire order */
	readonly queued: readonly Queued[];
	/** what has gone out, as the log's own rows */
	readonly fired: readonly PlayEntry[];
	/** what the composer holds, which take-back writes to */
	readonly draft: string;
	readonly setDraft: (text: string) => void;
	readonly queue: (text: string) => void;
	readonly unqueue: (id: string) => void;
} {
	const [queued, setQueued] = useState<readonly Queued[]>(seed);
	const [fired, setFired] = useState<readonly Queued[]>([]);
	const [draft, setDraft] = useState(writing);
	/**
	 * The counter is why the id exists at all: two identical messages are a real
	 * thing to type twice, and a ✕ has to reach exactly one of them.
	 */
	const taken = useRef(0);

	useEffect(() => {
		// a stopped turn takes the queue with it and hands the words back (#170), so the
		// only ending that fires is the clean one
		if (phase !== "settled") return;
		setQueued((waiting) => {
			if (waiting.length === 0) return waiting;
			setFired((gone) => [...gone, ...waiting]);
			return [];
		});
	}, [phase]);

	return {
		queued,
		fired: fired.map((message) => ({ key: `fired-${message.id}`, kind: "user", text: message.text })),
		draft,
		setDraft,
		queue: (text: string) => {
			taken.current += 1;
			const id = `said${taken.current}`;
			setQueued((waiting) => [...waiting, { id, text }]);
		},
		/**
		 * Taking one back, which is the same act as a stop cancelling the queue and is
		 * why #170 could state one invariant for both: **words that leave the queue
		 * un-fired land back in the box.**
		 *
		 * They land *above* whatever was already being written, in fire order, separated
		 * by a blank line. Above rather than below on two counts, neither of them taste:
		 * the queue's order is the order these were going to be said in, and appending
		 * would reverse it against the message being written; and the caret is in the
		 * middle of a half-finished sentence, so anything that lands under it moves the
		 * words the hand is on. Above, the tail of the box does not move at all.
		 *
		 * What it costs is the message count. Two messages that return become one blob of
		 * text in one field, so a stop that hands back two and an Enter that follows sends
		 * **one** message where two were queued. That is not a loss — the queue was going
		 * to fire them into one turn anyway (#170) — but it is the one place where the
		 * round trip is not lossless, and the blank line is what leaves the seam visible
		 * enough to split by hand.
		 */
		unqueue: (id: string) => {
			const message = queued.find((waiting) => waiting.id === id);
			if (message === undefined) return;
			setQueued((waiting) => waiting.filter((other) => other.id !== id));
			setDraft((box) => (box === "" ? message.text : `${message.text}\n\n${box}`));
		},
	};
}

/**
 * What you say to a turn you are not going to interrupt for it.
 *
 * Both are follow-ups to the plan being written on screen: the capture's agent is
 * about to build a Swedish habit tracker across `home`, `habit-detail` and
 * `add-habit`, and neither of these is worth an `interrupt` — the first reorders
 * work that has not started, the second is a detail the copy pass will want. That is
 * the case for a queue in one line: the alternative to holding them is stopping the
 * turn.
 *
 * Shared across the placements so that where the rows stand is the only thing under
 * test.
 */
export const QUEUE_SEED: readonly Queued[] = [
	{ id: "order", text: "hold off on add-habit until i've seen home" },
	{ id: "chips", text: "swedish weekday chips on the week strip, not mon tue wed" },
];
