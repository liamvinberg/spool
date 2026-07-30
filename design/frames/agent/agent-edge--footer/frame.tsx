import { EdgeFrame } from "../../../shared/ui/spool-edge-rail";

/**
 * agent-edge--footer — the beat leaves the log's flow and pins to its bottom edge.
 *
 * **What it proposes.** The log is a column of receipts and a wait is not one, so it
 * is taken out of the column entirely: an absolutely positioned line at the bottom of
 * the transcript, over its own fade, that fades in when the request goes out and fades
 * out when the answer lands. Nothing in the flow is created or destroyed, so there is
 * no height for anything to move by. It is the one take whose zero is structural
 * rather than measured — the meter can only confirm it.
 *
 * It names the beat, for the same reason `settle` does: `waiting 1.4s`.
 *
 * **The reserve question, answered before it is asked.** The log carries a constant
 * 24px of extra bottom padding so the footer never covers the last row. That is not
 * #145's reserve and it fails none of the arguments against it. #145 reserved *a
 * message's own height*, which appeared when the message started and went when it
 * settled — it moved, and it put screens of scrollable nothing into the log. This is
 * 24px of margin that is there before the first keystroke and after the last row, on
 * an empty thread and a full one. A constant cannot shift anything, and 24px is not a
 * screen.
 *
 * **What it costs.** The wait leaves no receipt, which is the same cost `now` has and
 * the reason `answered()` was written the way it was: scroll back through a finished
 * turn and the four waits are gone. It also spends a fixed 24px of transcript on every
 * thread whether or not a turn ever runs. And a fixed footer is a second live object
 * in the rail beside the composer footer's stop, nine pixels below it, both saying a
 * turn is running.
 *
 * **What it beats, and the thing that turned up when it was drawn live.** It beats
 * everything on movement — it is the only take whose zero needs no measurement. But
 * played beside `settle` it is, for most of the turn, *the same picture*. The log
 * follows the live end, so while you are watching, the last row's bottom is at the
 * inset and the footer sits directly under it, in the same column, at the same size,
 * in the same words. That is #176's own finding about the queue arriving again in a
 * different object: "Tail and band turned out to be one design — the transcript
 * auto-follows, so while you are watching, the tail's queue sits exactly where the
 * band puts it, and they diverge only once you scroll up." They diverge here in
 * exactly the same place, and this frame is alive, so scrolling the log mid-turn is
 * how you see it: the beat stays and the words go under it.
 *
 * The rule it implies is *only past tense in the log*. It is not applied further here:
 * #145 already put the agent's question in the log and this take does not reopen that,
 * so an answered ask still shrinks by its options.
 */
export default function EdgeFooterFrame() {
	return (
		<EdgeFrame
			where="footer"
			title="footer · out of the flow, on the transcript's edge"
			claim="nothing enters or leaves the column, so there is no height to move by. zero is structural."
			notes={[
				"while you follow the live end this is pixel-identical to a row",
				"in the log. scroll up mid-turn: it is the only beat that stays.",
				"the 24px inset is constant, not #145's reserve. it never moves.",
				"unfixed: an answered ask still drops its options in the log.",
			]}
		/>
	);
}
