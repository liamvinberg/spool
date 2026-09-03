import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-compile: the three open answers worn together, over the whole turn.
 *
 *   threads   `threads-plate`, decided 2026-09-03. The ask names the thread, the marks
 *             of whatever is moving elsewhere sit on the plate, the chevron drops the
 *             list, and the dock glyph is the only thing that shuts the panel.
 *   words     `soft`, recommended. The landed text is laid out once and a feathered
 *             mask uncovers it at the pace, so nothing pops and nothing re-wraps.
 *   log       `open`, recommended. A row opens from no height to its own over 260ms
 *             and rises into it, in CSS alone.
 *
 * It plays the full 22 second turn rather than the say loop, because the point is how
 * the three read against each other across a whole turn. Press the plate for the list.
 */
export default function AgentCompileFrame() {
	return <StreamStage words="soft" log="open" chrome="plate" />;
}
