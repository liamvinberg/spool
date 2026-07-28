import { SpoolFindScreen } from "../../../shared/ui/spool-find-screen";

/**
 * spool-canvas--find-split: the name kerned into segment columns, counted from the
 * tail so the part that differs lines up.
 *
 * Same query, same ten rows. The name is cut on its dashes and each segment gets a
 * column as wide as the widest one in the visible results, dashes and all, measured
 * in `ch` because a monospace face makes that exact. Columns are counted from the
 * end rather than the start, so a two-segment name drops into the last two columns
 * and its tail still lands under everything else's.
 *
 * Once the columns line up they can be compared, and that is the second half of the
 * idea: a column saying exactly what the column above it said goes quiet. So the
 * first row prints `agent- play-- plan- pinned` whole and the nine under it print
 * almost nothing except the word that changed. It is the ledger trick, and on a
 * list of variants it is the only take here that makes the repetition *provable*
 * rather than merely faint.
 *
 * **On this query it is the best-looking thing in the set, and that is the
 * problem.** All ten results have exactly four segments, so the grid is perfect and
 * the quieting has a clean run of nine rows to work on. Nothing else here reads
 * that fast.
 *
 * Then type `site` into it. The results are 2-, 3- and 4-segment names at once, the
 * grid re-measures to the deepest of them, and every shallow name gets indented by
 * a column it does not have. The left margin goes ragged, the widths jump as you
 * type another letter, and the thing that made it fast is gone. Type `agent-play`
 * and watch the columns resize under the caret. That is the honest demo and it is
 * why this frame is live rather than a picture.
 *
 * The assumption underneath it is that a frame name is a taxonomy, where position
 * one means the same kind of thing on every row. In this project it nearly is,
 * because one wayfinder map named 49 frames in a week. It is not a property of
 * spool, it is a property of a fortnight, and a chrome that is beautiful only while
 * a naming habit holds is a chrome that decays quietly.
 *
 * The quieting has its own cost and it is not small: a row here cannot be read on
 * its own. `nav- row` at the bottom of the list only says `agent-play--nav-row`
 * because eight rows above it said `agent-` and `play--` out loud, so the moment
 * you scroll, or re-sort, or land on a row without having read the ones over it,
 * the name is incomplete. Dim never has that problem, because every row there is
 * still whole.
 *
 * **What it proves anyway**, and `--find-dim` should be read against it: the ragged
 * inner edge in dim is real, and a fixed grid does remove it. The trade is that dim
 * is ragged in a way that never gets worse, and this is flush in a way that only
 * holds for names that rhyme.
 */

export default function SpoolCanvasFindSplitFrame() {
	return <SpoolFindScreen rows="split" query="plan" homeTarget="spool-home" />;
}
