import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * How many objects enter and leave the live edge over a whole turn.
 *
 * Round one measured *movement* and four takes came back at zero, which settled
 * nothing: the objection was never 38 pixels. It was that the indicator itself comes
 * and goes. A thing that is created when a request goes out and destroyed when the
 * answer lands is a blinking thing, and at a measured zero shift it is still something
 * arriving and leaving at the edge of the eye twelve times a turn.
 *
 * So this is the number that decides round two, and `edge-shift.ts` becomes the floor
 * every take has to clear before this one is even read.
 *
 * **What is counted.** Elements, not renders. A `MutationObserver` on the transcript
 * watches `childList` across the whole subtree and counts nodes coming in and going
 * out, split by what they are:
 *
 *   entries    `[data-edge-key]` — the transcript's own rows and messages. Every take
 *              has these and nobody objects to them: a log gaining a row is the log
 *              working. It is here as the shared baseline, so the indicator's own
 *              number is read against something.
 *   indicator  `[data-wait-part]` — the object under test, whatever and wherever it is.
 *              This is the deciding column.
 *
 * A node carrying both is only ever counted as an indicator. Today's beat is a row in
 * the log and needs the entry attribute for `useShift` to watch it move, but it is not
 * a receipt for anything and must not hide inside the log's own churn.
 *
 * **On screen is measured off the mutations rather than sampled.** A poll would put the
 * answer's precision at its own interval, and the shortest wait in the captures is
 * 878ms. Presence is checked when the observer starts and again on every batch that
 * changes it, so the accumulated time is exact to the mutation that caused it.
 *
 * **What it cannot see.** An element that stays mounted and animates from nothing to
 * something — opacity 0 to 1 — counts as never entering, because it never does. That is
 * the correct answer to the question being asked and the wrong answer to a different
 * one, so a take that fades a fixed object in and out reads 0 enters here and has to be
 * argued about on its own terms. `agent-edge--footer` is exactly that case and it is
 * why the on-screen percentage is reported beside the count instead of under it.
 */

export interface Churn {
	/** indicator elements created inside the transcript since the turn began */
	readonly enters: number;
	/** indicator elements destroyed */
	readonly leaves: number;
	/** transcript rows and messages created, which is the log doing its job */
	readonly rowsIn: number;
	/** transcript rows and messages destroyed, which is the splice */
	readonly rowsOut: number;
	/** ms of the turn with any indicator element in the tree */
	readonly onMs: number;
	/** ms watched */
	readonly ofMs: number;
}

const NONE: Churn = { enters: 0, leaves: 0, rowsIn: 0, rowsOut: 0, onMs: 0, ofMs: 0 };

const MARK = "[data-wait-part]";
const ROW = "[data-edge-key]";

/** every element in this node's own tree matching a selector, the node included */
function within(node: Node, selector: string): HTMLElement[] {
	if (!(node instanceof HTMLElement)) return [];
	const found = [...node.querySelectorAll<HTMLElement>(selector)];
	return node.matches(selector) ? [node, ...found] : found;
}

export function useChurn(view: RefObject<HTMLElement | null>, run: number, watching: boolean): Churn {
	const [shown, setShown] = useState<Churn>(NONE);
	const tally = useRef({ enters: 0, leaves: 0, rowsIn: 0, rowsOut: 0, onMs: 0 });
	const clock = useRef({ from: 0, since: null as number | null });

	useEffect(() => {
		tally.current = { enters: 0, leaves: 0, rowsIn: 0, rowsOut: 0, onMs: 0 };
		clock.current = { from: 0, since: null };
		setShown(NONE);
	}, [run]);

	useEffect(() => {
		const box = view.current;
		if (!watching || box === null) return;

		const now = () => performance.now();
		const started = now();
		clock.current = { from: started, since: box.querySelector(MARK) === null ? null : started };

		const read = (): Churn => {
			const at = now();
			const open = clock.current.since;
			return {
				enters: tally.current.enters,
				leaves: tally.current.leaves,
				rowsIn: tally.current.rowsIn,
				rowsOut: tally.current.rowsOut,
				onMs: Math.round(tally.current.onMs + (open === null ? 0 : at - open)),
				ofMs: Math.round(at - clock.current.from),
			};
		};

		const watch = new MutationObserver((records) => {
			for (const record of records) {
				for (const node of record.addedNodes) {
					const marks = within(node, MARK).length;
					if (marks > 0) tally.current.enters += marks;
					else tally.current.rowsIn += within(node, ROW).length;
				}
				for (const node of record.removedNodes) {
					const marks = within(node, MARK).length;
					if (marks > 0) tally.current.leaves += marks;
					else tally.current.rowsOut += within(node, ROW).length;
				}
			}
			// presence is re-read once per batch rather than inferred from the counts: a
			// take can hold two marked nodes at once and one leaving is not the object going
			const here = box.querySelector(MARK) !== null;
			const open = clock.current.since;
			if (here && open === null) clock.current.since = now();
			if (!here && open !== null) {
				tally.current.onMs += now() - open;
				clock.current.since = null;
			}
		});
		watch.observe(box, { childList: true, subtree: true });
		const flush = window.setInterval(() => setShown(read()), 200);
		return () => {
			watch.disconnect();
			window.clearInterval(flush);
			// the turn ending is when the number stops being provisional
			setShown(read());
		};
	}, [view, watching]);

	return shown;
}
