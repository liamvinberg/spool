import { SpoolAgentScreen } from "../../../shared/ui/spool-agent-screen";

/**
 * The cheap bet: the agent moves into the rail exactly as the rail is. 300px,
 * three tabs where there were two, and every tool call folded onto one line so
 * the path and the diff count survive. You keep the whole canvas. You lose every
 * result the tool came back with.
 */
export default function AgentRailFrame() {
	return <SpoolAgentScreen variant="rail" />;
}
