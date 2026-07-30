import { RichTake } from "../../../shared/ui/spool-rich-take";

/**
 * agent-rich--table-widen — the table stays a table, wraps to fit, and says what it would
 * rather have. Pressing it takes the rail out to that width.
 *
 * **What it proposes.** A real grid with wrapping cells, so nothing is ever off the edge,
 * plus one mono line under it naming the width the grid actually wants and offering to go
 * there. The offer is not a new mechanism: `agent-rail.tsx` has been drag-resizable the
 * whole time, 200 to 480 with 420 the default, and #184's whole premise was that nobody had
 * noticed. This is the one take that treats the rail's width as a thing the content may ask
 * about rather than a constant to design around.
 *
 * **What it beats.** It beats `scroll` on reachability, since a wrapped cell is always
 * visible, and it beats `open` and the two vertical takes on fidelity, because what you end
 * up reading is the table the agent wrote, in the log, in its own shape. The affordance also
 * teaches the rail's own drag, which nothing else in the transcript does.
 *
 * **What it costs, and the first cost kills it.** The frame measures the width the table
 * wants rather than guessing it, and the answer is **713px**. The rail's ceiling is 480. So
 * the offer can move 392px of text to 452, which is 60px, about a tenth of the way to what
 * the content asked for, and the table is still wrapping when it gets there. A control that
 * takes you a tenth of the way is worse than no control, because it is the one that promised.
 *
 * The second cost is that widening the rail is not a local act. The rail sits over the
 * canvas and the canvas is the thing the message is about, so paying for a table with 60px
 * of the frame you are working on is a trade the reader did not ask to make and has to undo
 * by hand. The third is wrapping itself: at the 200px floor the three prose columns become
 * shreds four characters wide and the row label breaks mid-word.
 *
 * **What it does while the table is arriving, and the walk found it.** Auto table layout
 * allocates a column from every row it holds, so when the second row's label lands, nine
 * characters longer than the first's, the whole grid is re-laid and an earlier cell can fit
 * on fewer lines than it did a character ago. **The block gets 20px shorter, once, at 300
 * and again at 420** — the rail's own default — and text the reader is in the middle of
 * moves up under them. It is one frame out of 299, and one is the number #148 spent an
 * entire ticket driving to zero.
 *
 * The repair exists and it is `table-fixed`, which divides the column equally and so cannot
 * be re-measured by anything: drawn that way this take scores zero drops. It is not drawn
 * that way because an equal third of the floor is 57px, and a table whose columns ignore
 * their contents is not the table the agent wrote either. Both faults are the same fault,
 * which is that this is a grid in a column too narrow to hold one.
 *
 * The offer is therefore withheld until the message settles, which the renderer does on
 * purpose: the width a half-arrived table wants climbs on every row, so a live affordance
 * would be a control whose label changes while you reach for it.
 */
export default function AgentRichTableWidenFrame() {
	return (
		<RichTake
			take="widen"
			title="table widen"
			note="a wrapping grid that names the width it wants, and a press that goes there"
			widths={[
				"the floor: three prose columns in 172px of text",
				"what inspector.tsx shipped",
				"the default · press the offer and this column moves",
				"the ceiling, and what the offer can reach at most",
			]}
			tall={420}
			arriveTall={260}
			verdict="the only take here whose block gets shorter while it arrives: 20px, once, at 300 and at 420; the width it asks for is 713 against a ceiling of 480"
			arriving="the grid re-lays every row when a wider label arrives, so earlier rows can lose a line; the offer waits for the last character"
		/>
	);
}
