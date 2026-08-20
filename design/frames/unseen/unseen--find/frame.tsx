import { SpoolFindScreen } from "../../../shared/ui/spool-find-screen";
import { FIND_MARKS } from "../../../shared/lib/unseen-model";

/**
 * `/` over spool's own 88 frames, with the record in it.
 *
 * The palette needed nothing invented: the empty query is already every frame
 * newest first, and what an agent just made is what is newest, so the unseen are
 * already the rows under the caret when it opens. The disc only confirms it, and
 * the count in the corner is the one number in the app that says how much is owed.
 *
 * The rail behind reads the same record — `agent` collapsed, wearing a disc for the
 * three inside it. Nothing here clears anything: a name in a list is not a frame.
 * Typing still re-ranks, arrows still move, Enter still flashes the row it would
 * land on.
 */
export default function UnseenFindFrame() {
	return <SpoolFindScreen rows="dim" unseen={FIND_MARKS} />;
}
