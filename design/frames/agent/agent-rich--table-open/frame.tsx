import { RichTake } from "../../../shared/ui/spool-rich-take";

/**
 * agent-rich--table-open — the table is drawn where it stands, cut off at the column, and
 * presses to full width over the whole canvas.
 *
 * **What it proposes.** In the log the grid renders at its own width and is simply clipped
 * by the box, with the cut edge drawn as a fade so it reads as *continues* rather than as
 * *ends*. Under it, one mono line saying how big it is and that it opens. A press holds it
 * over the frame at life size in `spool-lightbox.tsx`, which already exists and is already
 * generic.
 *
 * **What it beats, and it beats it on precedent rather than on taste.** #194 answered this
 * exact question once already: a screenshot in the rail is a real 120px thumbnail that
 * presses to life size, because at 120px you can tell *that* it changed and not *what*
 * changed. A three-column table in 392px is the same sentence about a different object. The
 * lightbox is the rail's existing answer to *this thing is bigger than this column*, and
 * every other take here invents a second one.
 *
 * It also beats `widen` outright on the same axis: both say the table needs more room, but
 * one takes the room from the canvas permanently and the other borrows the whole screen for
 * as long as you are looking and gives it back on esc. The ceiling problem disappears with
 * it, since the lightbox is not capped at 480.
 *
 * **What it costs.** #148 decided that an agent message renders whole and is clamped never,
 * on the grounds that the agent's words are the one thing in the rail nobody can reconstruct
 * from anywhere else. A table you have to open is a clamp with a nicer name. The counter is
 * that nothing is hidden: the table is drawn, in place, at real size, and what the press buys
 * is the columns past the edge rather than the fact that they exist. Whether that is a clamp
 * is the question this frame is asking, and it is a taste call rather than a measurement.
 *
 * The second cost is that it makes the log a place with doors in it. A transcript where some
 * blocks must be opened is a transcript you cannot read by scrolling, and #193 already spent
 * that budget on tool payloads.
 *
 * **What it does while the table is arriving.** The same as `scroll` and for the same
 * reason: nowrap cells mean one line per row forever, so the block grows by a row at a time
 * and never shrinks, at **zero drops over 299 prefixes at every width**. It differs in what
 * the reader sees, and in its favour: the clip is a fixed edge, so the lateral re-measuring
 * that slides `scroll`'s columns under the reader happens mostly *past* the cut. The count
 * is identical at **101 of 299**; the visible half of it is smaller.
 * The press is offered from the first row, and opening a table that is still being written
 * is fine, since the lightbox draws the same growing block bigger.
 */
export default function AgentRichTableOpenFrame() {
	return (
		<RichTake
			take="open"
			title="table open"
			note="drawn in place, cut at the column, and a press holds it over the canvas"
			widths={[
				"the floor: one column and the edge of a second",
				"what inspector.tsx shipped",
				"the default · press the table to open it",
				"the ceiling the drag stops at",
			]}
			tall={230}
			arriveTall={220}
			verdict="the same streaming story as scroll, with most of the lateral movement happening past the cut"
			arriving="one line per row from the first character, and the press is offered before the table is finished"
		/>
	);
}
