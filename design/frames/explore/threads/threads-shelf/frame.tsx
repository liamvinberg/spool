import { ThreadsStage } from "shared/ui/explore/threads/threads-stage";

/**
 * threads-shelf: the list is a surface, not a menu.
 *
 * Same plate as `threads-plate`, without the marks on it. Pressing the plate swaps the log
 * for the list, full height, grouped by what is happening: working, waiting on you,
 * finished. Rows are the ask wrapped to three lines over the frames written and the age.
 * The composer stays where it is and says `start a new thread`, so the shelf is also the
 * place a new conversation begins.
 *
 * A menu has to fit; a surface has the room to group, and grouping is what a column of
 * marks was trying to say with shape. The cost is that the log is out of sight while the
 * list is open, so checking on a thread means leaving the one you were in.
 *
 * The shelf opens on this frame to be seen. Press the plate to return to the log.
 */
export default function ThreadsShelfFrame() {
	return <ThreadsStage take="shelf" />;
}
