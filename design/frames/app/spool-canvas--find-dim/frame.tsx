import { SpoolFindScreen } from "../../../shared/ui/spool-find-screen";

/**
 * spool-canvas--find-dim: the recommendation. The name never moves, only its
 * brightness does.
 *
 * Press `/` on the canvas and this opens. Type into it, it is real: the matcher in
 * `shared/lib/frame-find.ts` is the one that would ship, and the list is this
 * project's actual 88 frames read off `design/frames/`.
 *
 * The query it opens on is `plan`, and the ten rows it returns are the argument
 * for ranking before any row treatment is involved. Two of them are frames where
 * `plan` is a whole segment. The other eight are frames where `plan` is `pla`
 * borrowed from `play` and an `n` borrowed from `nav`, which is a real subsequence
 * and a real coincidence at the same time. Substring would find two of the ten.
 * Subsequence finds all ten and cannot tell you which two you meant. Ranking is
 * the entire product, and the score gap here is 42 against 18.
 *
 * **The row is three zones and no more.** Everything before the first landing is
 * the run-up you did not ask for, and it goes to `text-muted/40`. The letters you
 * typed are the thread. Everything from the first landing onward is full text,
 * because that is where the difference between two near-identical frames always
 * lives: `-pinned` against `-log`, `-dock` against `-drawer`.
 *
 * On the eight weak rows this looks scattered, and it should. A row whose
 * highlight is in three pieces is a row that matched by accident, and the eye sorts
 * the list before it has read a single word.
 *
 * **Why this one wins over the two to its right.**
 *
 * It is the only take that has an answer for an empty query. `--find-fresh` is the
 * same palette with nothing typed, and dim needs no special case there: nothing
 * was matched, so nothing is dimmed, and the names come out whole. `--find-tail`
 * and `--find-split` both have to be told what to do when there is no query, and a
 * treatment that only exists once you have typed is half a treatment.
 *
 * The row is still literally the name, in order. In spool the name is the
 * identity: it is the folder on disk, the `data-go` literal, the walk target, the
 * thumbnail key and the URL. `--find-tail` prints `nav-dock` and makes you
 * reassemble `agent-play--nav-dock` before you can type it anywhere else, and you
 * pay that every time rather than once.
 *
 * It has no opinion about naming. `agent-play--nav-shut`, `directing--annotate`
 * and `site-states` all read the same way through it. `--find-split` is the
 * prettiest thing here on this exact query and it is prettiest because all ten
 * results happen to have four segments. The next project will not be named like
 * this one.
 *
 * **What it costs, and it is one thing.** The bright part starts at a different x
 * on every row, because the run-up is `agent-` on two of these rows and
 * `agent-play--` on the other eight. The column has a ragged inner edge, and that
 * is precisely what `--find-split` fixes.
 *
 * The mechanic and its citations are in `shared/ui/spool-find-palette.tsx`. What
 * is inert here is only the camera and Escape, and both for the same reason: there
 * is no canvas behind a frame.
 */

export default function SpoolCanvasFindDimFrame() {
	return <SpoolFindScreen rows="dim" query="plan" homeTarget="spool-home" />;
}
