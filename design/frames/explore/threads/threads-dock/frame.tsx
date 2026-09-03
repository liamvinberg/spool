import { ThreadsStage } from "shared/ui/explore/threads/threads-stage";

/**
 * threads-dock: threads are the dock's third surface.
 *
 * The most radical row, and the one that answers the doubling directly. Every switch the
 * rail makes is made in the one strip: properties, agent, threads. The threads surface is
 * the shelf's grouped list with the plus over it; picking a row lights the agent glyph
 * again with that thread in the panel. The agent panel's plate is only the ask and the
 * two buttons the panel already had.
 *
 * The badge on the threads glyph is the column's answer moved to the strip: a turning
 * ring while something works elsewhere, a dot when something finished unread. The strip
 * already draws that badge on the agent glyph when the panel is shut, so nothing new is
 * invented.
 *
 * The threads surface is open on this frame. Press a row, or the agent glyph, to go back.
 */
export default function ThreadsDockFrame() {
	return <ThreadsStage take="dock" />;
}
