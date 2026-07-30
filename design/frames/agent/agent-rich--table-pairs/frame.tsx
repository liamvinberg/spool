import { RichTake } from "../../../shared/ui/spool-rich-take";

/**
 * agent-rich--table-pairs — the table read as a definition list: a term, its definitions
 * under it, and the column names stated once instead of on every cell.
 *
 * **What it proposes.** The header row is lifted out and printed once as a quiet mono
 * legend. Each body row is then a term, the first cell in full-strength text, with the
 * remaining cells indented under it in the order the legend gives. It is `stack` with the
 * repetition taken out.
 *
 * **The first thing it was supposed to beat, it does not.** This frame was drawn expecting
 * it to be the shortest take here, and the band above says otherwise: at the rail's own 420
 * it settles at **188px against `stack`'s 178**, because the repeated key rides along on the
 * value's own line and costs nothing, while the legend costs a whole line of its own. The
 * saving only appears at the floor, where the keys start pushing values onto second lines:
 * **268 against 318 at 200px**. So it is shorter exactly where the rail is least likely to
 * be and taller where it usually is, which is the opposite of the argument it was drawn to
 * make. What it does beat is rhythm: at 420 the block is two terms and four lines rather
 * than two terms, four keys and four lines.
 *
 * Against `scroll` it beats the same thing `stack` does, which is that nothing is off the
 * edge at any width the rail can be dragged to.
 *
 * **What it costs, and it is worth being blunt about.** With two value columns a definition
 * list is exactly right: the term and its one definition, which is what most tables an agent
 * writes actually are. With three it stops carrying the mapping. `60px bruise gone in 1
 * frame` and `draws in over 13 frames (217ms)` sit one above the other with nothing saying
 * which is `before` and which is `after` except their order and a legend four lines up. The
 * reported message's empty first header cell makes it worse rather than better: the legend
 * can only name two of the three columns, so the reader is matching two labels against three
 * lines. **This take is right for the table it is not being drawn against**, and drawing it
 * here is what makes that visible.
 *
 * **What it does while the table is arriving.** The same as `stack`, and for the same
 * reason: nothing measures anything outside its own row, so a landing row appends and
 * nothing above it moves. One thing is worse. The legend is drawn from the header row and
 * sits *above* every row, so while the header is still arriving the top line of the block is
 * growing while rows land under it. It grows rather than shrinks, so the height never drops,
 * but the one line the reader needs in order to read the rest is the last thing to be
 * complete.
 */
export default function AgentRichTablePairsFrame() {
	return (
		<RichTake
			take="pairs"
			title="table pairs"
			note="a definition list: the term, its definitions, the column names said once"
			widths={[
				"the floor, and it survives it",
				"what inspector.tsx shipped",
				"the default, and the case that decides it",
				"the ceiling the drag stops at",
			]}
			tall={330}
			arriveTall={250}
			verdict="not the shortest take: 188px at 420 against stack's 178, because the legend costs a line and a repeated key does not"
			arriving="rows append and nothing above them moves, but the legend that makes them readable is drawn from the header and finishes first"
		/>
	);
}
