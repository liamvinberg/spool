import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-pen: one character at a time, and nothing ever moves but the edge.
 *
 * The landed text is laid out whole, once, and a mask uncovers it to the character the
 * drain has reached. That is what makes the character a unit the rail can afford: the
 * shipped renderer cannot draw per character because a word rendered half-way wraps to
 * the next line when its second half arrives, and a span per glyph breaks text shaping.
 * Here the wrap is settled before the edge gets there, so the edge can be a glyph and
 * the caret rides it.
 *
 * It costs one rectangle measurement and one style write per frame, and no React render
 * between deltas. The reserve is gone as a separate thing: the block is the landed text,
 * which is the same height the rail already holds open.
 */
export default function AgentSayPenFrame() {
	return <StreamStage words="pen" log="cut" focus="say" />;
}
