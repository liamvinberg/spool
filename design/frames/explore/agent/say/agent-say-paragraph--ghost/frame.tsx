import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-paragraph--ghost: the arriving paragraph is on screen, dimmed to shape.
 *
 * The stream is drawn as it lands, at 30% strength, so the reader sees how much is coming
 * and where it will sit without being asked to read it. When the paragraph is whole it
 * comes up to full strength over 300ms in place. Nothing opens, because the height is
 * already there; the cost is that the log still steps as the dim text grows.
 */
export default function AgentSayParagraphGhostFrame() {
	return <StreamStage words="ghost" log="cut" focus="say" />;
}
