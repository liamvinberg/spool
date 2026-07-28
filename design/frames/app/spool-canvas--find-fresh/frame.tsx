import { SpoolFindScreen } from "../../../shared/ui/spool-find-screen";

/**
 * spool-canvas--find-fresh: just summoned, nothing typed. Newest frames first.
 *
 * This is the loop the palette actually exists for, and it needs no typing at all.
 * An agent finishes a turn and says it made four takes on a question. You press `/`
 * and they are the top four rows. Enter, and you are looking at the first one.
 *
 * It is not a demo of that loop, it is a recording of it. The list is
 * `design/frames/` in folder birth order and the four rows at the top are these
 * four frames, which were the newest thing on disk when the fixture was read. Under
 * them is the batch before, `agent-mark--open / --edge / --label` from three
 * minutes earlier, then the four `--ask-*` takes from an hour before that. The
 * project's whole recent history is legible in ten rows without a query, which is
 * the thing the alphabetical Pages rail can never do at any width.
 *
 * **The empty query is not an empty answer.** An alphabetical list of 88 frames
 * with nothing typed would be a wall, and worse, a wall whose top is `agent-mark--edge`
 * forever. Recency is the only ordering that is about you rather than about the
 * alphabet, and it is the same tiebreak the ranked list already uses, so the rule is
 * one sentence long: score, then newest.
 *
 * **Two things appear only here.** The age column, because a list sorted by
 * something invisible reads as unsorted. And the words `newest first`, which take
 * the count's place in the corner of the field: an order you did not ask for has to
 * say what it is. Both disappear the moment you type, because then the order is the
 * one you asked for, the highlight already explains it, and the count is the more
 * useful number.
 *
 * It wears `--find-dim`'s row treatment, which is the recommendation, and it is
 * also the argument for it: with no query there is nothing matched, so nothing is
 * dimmed, and every name comes out whole with no special case anywhere.
 * `--find-tail` and `--find-split` would both need one.
 *
 * Arrow down past the fourth row and `agent` lights in the Pages rail, because that
 * is where the next frame lives. `app` never lights: it is the page you are already
 * on, and pointing at where you are is not an answer to anything. Four rows in, you
 * have crossed a page without having had to know you were crossing one.
 */

export default function SpoolCanvasFindFreshFrame() {
	return <SpoolFindScreen rows="dim" homeTarget="spool-home" />;
}
