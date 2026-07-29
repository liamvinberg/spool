import { useEffect, useRef, useState } from "react";
import type { PlayEntry, Queued, TurnPhase } from "./turn-play";

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
export function useQueue(seed: readonly Queued[], phase: TurnPhase): {
	/** what is still waiting, in fire order */
	readonly queued: readonly Queued[];
	/** what has gone out, as the log's own rows */
	readonly fired: readonly PlayEntry[];
	readonly queue: (text: string) => void;
	readonly unqueue: (id: string) => void;
} {
	const [queued, setQueued] = useState<readonly Queued[]>(seed);
	const [fired, setFired] = useState<readonly Queued[]>([]);
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
		queue: (text: string) => {
			taken.current += 1;
			const id = `said${taken.current}`;
			setQueued((waiting) => [...waiting, { id, text }]);
		},
		unqueue: (id: string) => setQueued((waiting) => waiting.filter((message) => message.id !== id)),
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
