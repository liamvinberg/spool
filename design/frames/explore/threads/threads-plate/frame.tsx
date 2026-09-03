import { ThreadsStage } from "shared/ui/explore/threads/threads-stage";

/**
 * threads-plate: the column is gone, and the plate does its job.
 *
 * Two columns of chrome instead of three. The nameplate becomes a control: the ask on the
 * left, then the marks of whatever is moving in another thread, then a chevron. Pressing
 * it drops the list over the log, every thread as its ask wrapped to three lines with the
 * frames it wrote and its age under it, the open one shaded, a close on hover. The plus
 * moves onto the plate beside the collapse caret.
 *
 * The marks on the plate are what keeps the column's one glanceable answer: a ring
 * turning there means something is working elsewhere, a dot means something finished.
 * They are small and they carry no names, which is exactly what the column was.
 *
 * The plate ends on the plus. The collapse caret is gone from it, because the dock glyph
 * that opened the panel is the thing that shuts it again, and a second control for the
 * same act was the doubling in miniature (decided 2026-09-03).
 *
 * The list opens on this frame to be seen. Press the plate to close it.
 */
export default function ThreadsPlateFrame() {
	return <ThreadsStage take="plate" />;
}
