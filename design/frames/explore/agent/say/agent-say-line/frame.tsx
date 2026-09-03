import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-line: a line at a time.
 *
 * The most radical row, because it stops pretending the wire types. A delta carries a
 * line or two, so the unit here is the line: a line is uncovered whole once the text
 * after it has begun, which is the moment its wrap can no longer change, and it fades
 * up over 200ms. Two lines completing in one delta come up 120ms apart. The last line
 * comes up when the message ends.
 *
 * What it buys is calm: nothing on screen is ever mid-word, and a paragraph composes
 * itself the way a typeset page would. What it costs is honesty about the edge. Half a
 * line of arrived text is always waiting off-screen for its wrap to settle, so the log
 * runs about a line behind the wire, and the caret sits at the end of a finished line
 * rather than under a moving hand.
 */
export default function AgentSayLineFrame() {
	return <StreamStage words="line" log="cut" focus="say" />;
}
