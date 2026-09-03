import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-paragraph--sentence: the same rule, with the sentence as the unit.
 *
 * A sentence is whole once the one after it has begun, so the wait is a few hundred
 * milliseconds rather than a paragraph's one to two seconds, and each arrival is a line or
 * two rather than four. A fence, a list item or a quote stays a paragraph, because a
 * sentence boundary inside those is not one.
 */
export default function AgentSayParagraphSentenceFrame() {
	return <StreamStage words="sentence" log="cut" focus="say" />;
}
