import { RichTake } from "../../../shared/ui/spool-rich-take";

/**
 * agent-rich--table-stack — the table transposed: one group per row, every cell keeping the
 * name of the column it came from.
 *
 * **What it proposes.** There is no grid. Each body row becomes a small group: the first
 * cell on its own line in full-strength text, because in every table an agent writes the
 * first column is the subject, and under it one line per remaining cell carrying that
 * column's header as a quiet mono key. The whole thing is vertical, so it fits any width
 * the rail can be dragged to, including the 200px floor.
 *
 * **What it beats.** It beats `scroll` on reachability: nothing is off the edge, no gesture
 * is required, and the 200px floor is not a special case. It beats `open` and `widen` on
 * directness, since the content is in the log where the agent put it rather than one press
 * or one drag away. And it is the only take that keeps every cell labelled, which matters
 * here because the reported message's first header cell is *empty* — the column holding the
 * row labels has no name at all, so a reading that relies on column order has one column it
 * cannot name.
 *
 * **What it costs, and the cost is the whole reason a table was written.** A table exists so
 * a column can be scanned. Transposed, `before` for row one and `before` for row two are
 * eight lines apart with three other lines between them, and the comparison the agent was
 * making — one close held a bruise for one frame, the other spread it over thirteen — has to
 * be reassembled by the reader. It is also the tallest take here at every width: **178px at
 * 420 against `scroll`'s 124**, and 318 against 144 at the floor, because the header text is
 * repeated once per cell.
 *
 * **What it does while the table is arriving, and it is the cleanest answer here.** A group
 * is drawn from one row and measures nothing outside itself, so a row landing appends a
 * group and touches nothing above it. There is no shared column geometry, which means there
 * is nothing for a later row to re-measure: **zero drops and zero re-widths at every width**,
 * and the zero is structural rather than lucky. The only movement is a cell growing a line as its own words
 * arrive, which is what every paragraph in the rail already does.
 *
 * The half-arrived header is the one thing to watch: the keys are read off the header row,
 * so while `| | before | af` is still landing a group can draw a key of `af` that becomes
 * `after` a beat later. It grows rather than moves, so it costs no height and no reflow.
 */
export default function AgentRichTableStackFrame() {
	return (
		<RichTake
			take="stack"
			title="table stack"
			note="one group per row, every cell keeping its column's name"
			widths={[
				"the floor, and it is not a special case here",
				"what inspector.tsx shipped",
				"the default, and the case that decides it",
				"the ceiling the drag stops at",
			]}
			tall={370}
			arriveTall={260}
			verdict="no shared column geometry, so there is nothing a later row can re-measure; what it pays is height and the lost column scan"
			arriving="a row appends a group and touches nothing above it; the keys grow with the header row rather than moving"
		/>
	);
}
