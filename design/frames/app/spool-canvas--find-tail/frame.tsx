import { SpoolFindScreen } from "../../../shared/ui/spool-find-screen";

/**
 * spool-canvas--find-tail: the difference leads, and the family it belongs to is
 * demoted to a column on the right.
 *
 * Same query, same ten rows, same matcher as `--find-dim`. What changes is that
 * the row is cut at the `--` seam and the halves swap: `nav-dock` at full weight
 * on the left edge, `agent-play` in muted on the right. A frame that is nobody's
 * variant has no seam to cut, so it keeps its whole name on the left and leaves the
 * right column blank, which is itself readable: those rows are frames, these rows
 * are variants of one.
 *
 * **What it gets right is real.** The left edge becomes pure difference. Ten rows
 * of `agent-play--` printed ten times is ten repetitions of a fact you already
 * know, and this is the only take here that refuses to print it at full strength.
 * Scanning `plan-pinned / plan-log / nav-drawer / nav-dock` down a flush left
 * margin is genuinely faster than scanning the same tails at char 12.
 *
 * **Two things kill it.**
 *
 * The match lands in the part it demoted. Look at the eight weak rows: they matched
 * `pla` inside `play`, which is now grey and on the far side of the row, so the
 * highlight is split across two columns with 100px of nothing between the halves.
 * The treatment fights the matcher on exactly the queries where you most need to
 * see why a row scored what it scored.
 *
 * The row stops being the name. `nav-dock` is not a frame in this project and
 * typing it into `data-go` targets nothing. Everywhere else in spool a frame name
 * is printed whole, because the name is the identity: the folder, the walk target,
 * the URL, the thumbnail key. Splitting it for one surface means this is the one
 * surface where you cannot read a name off the screen and use it.
 *
 * It also has nothing to say when nothing is typed, which `--find-fresh` needs: a
 * column of demoted bases and no highlight anywhere is just the name printed
 * backwards.
 *
 * Kept because the objection it raises is the right one and `--find-dim` does not
 * answer it: the shared prefix really is printed on every row, and dim only makes
 * it quiet.
 */

export default function SpoolCanvasFindTailFrame() {
	return <SpoolFindScreen rows="tail" query="plan" homeTarget="spool-home" />;
}
