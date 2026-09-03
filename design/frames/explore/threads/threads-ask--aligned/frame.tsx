import { ThreadsStage } from "shared/ui/explore/threads/threads-stage";

/**
 * threads-ask--aligned: the same take with the column on the dock strip's rhythm.
 *
 * The strip draws a 32px glyph every 36px from a 6px top inset. The column draws a 34px
 * cell from the top edge, so the plus sits 2px above the properties glyph and every mark
 * drifts further from the glyph beside it. Here the column takes the strip's numbers: the
 * plus is level with the properties glyph, the open thread is level with the agent glyph,
 * and cells are rounded squares like the glyphs are.
 *
 * What it fixes is the rhythm. What it does not fix is that two columns of 14px marks now
 * read as one grid, where a press in the left column changes the thread and a press in the
 * right changes the panel, and the plus lines up with the sliders as if they were related.
 */
export default function ThreadsAskAlignedFrame() {
	return <ThreadsStage take="ask" aligned />;
}
