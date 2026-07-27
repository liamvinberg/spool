import { SpoolAgentScreen } from "../../../shared/ui/spool-agent-screen";

/**
 * The same conversation, the same turn, at 420. Picking the agent tab pushes the
 * rail out; elements and connections stay at 300, so the cost is only paid where
 * it buys something. What 120px buys: a tool becomes a cell with its result
 * under it, and the edit can name the frame it repainted.
 */
export default function AgentWideFrame() {
	return <SpoolAgentScreen variant="wide" />;
}
