import { RichTake } from "../../../shared/ui/spool-rich-take";

/**
 * agent-rich--table-scroll — the table stays a table and the box scrolls sideways.
 *
 * **What it proposes.** A table renders as a grid at the width its own content wants, held
 * in the same bordered box a fenced block already gets, and that box scrolls horizontally
 * when the content is wider than the rail. Cells do not wrap. The reader sees a real table,
 * reads the columns that fit, and drags the rest into view.
 *
 * **Why it is the first candidate rather than the lazy one.** The rail already does exactly
 * this, and it has since #148: a fenced code block is `overflow-x-auto` with a scrollbar,
 * because a line of code is not a thing you may re-break. A table is the same claim about
 * the same kind of content, and answering it a second way would put two horizontal-overflow
 * vocabularies in one column of prose. It is also the only take that does not throw away
 * information: every other one here either drops a header, re-orders the reading, or moves
 * the content somewhere the log is not.
 *
 * **What it costs, and the cost is real at 420.** The message's own row labels are the
 * longest strings in it, so the column that carries them cannot be dropped and cannot be
 * narrowed. Measured rather than guessed: the grid is **715px** wide, so at the rail's own
 * 420 there are **323px off the right edge** and at the 200px floor there are **543**. The
 * first column alone is wider than the floor's whole box, so the header row is a row of
 * names for columns you cannot see and the scrollbar is the only thing saying they exist. Horizontal scrolling inside a vertically scrolling log is also a
 * gesture a trackpad makes by accident and a mouse wheel cannot make at all.
 *
 * **What it does while the table is arriving, which is the part that decides this.** Cells
 * are `whitespace-nowrap`, so every row is exactly one line from its first character to its
 * last: the block can only ever grow downward, one 30px row at a time, and no arriving
 * character can re-break a line that is already drawn. **Zero height drops over all 299
 * prefixes at every one of the four widths**, which is the metric #148 spent a ticket
 * driving to zero.
 *
 * **And the walk finds the fault the height metric cannot see.** A grid measures its own
 * columns from every row it holds, so the second row's label, which is nine characters
 * longer than the first's, widens column one the moment it lands and slides both other
 * columns sideways under the reader. The `grid re-widths` column counts it at **101 of 299
 * prefixes, identically at every width**: a third of the message spent moving sideways, and
 * a number only this take and `open` pay.
 *
 * `closedRich` is what keeps even this much intact: a run of pipes is a table from its
 * first character, and a half-written `|---|` row waits for the newline the same way a
 * nascent fence waits for its third backtick.
 */
export default function AgentRichTableScrollFrame() {
	return (
		<RichTake
			take="scroll"
			title="table scroll"
			note="a grid at its own width, in a box that scrolls sideways"
			widths={[
				"the floor: column one alone is wider than the box",
				"what inspector.tsx shipped",
				"the default, and the case that decides it",
				"the ceiling the drag stops at",
			]}
			tall={200}
			arriveTall={200}
			verdict="nowrap means every row is one line, so the block only grows; what it pays is lateral, and the walk counts it"
			arriving="one row lands per delta and each is a single line, so nothing above ever moves down; the grid re-measures its columns as rows arrive"
		/>
	);
}
