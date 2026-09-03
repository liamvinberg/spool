import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-compile--paragraph: the compile with the paragraph take in place of soft.
 *
 * Same plate, same rows opening, and the agent's words arrive a paragraph at a time
 * instead of a character at a time. Watch the two prose blocks against the rows around
 * them: a paragraph landing whole is the same gesture as a row landing, which is the
 * argument for it, and the still second before each is the argument against.
 */
export default function AgentCompileParagraphFrame() {
	return <StreamStage words="paragraph" log="open" chrome="plate" />;
}
