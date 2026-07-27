import { SpoolAgentScreen } from "../../../shared/ui/spool-agent-screen";

/**
 * The wide rail one turn later, mid-flight. The edit at the top of the run has
 * already reached disk, so cart out on the field is repainting while the text is
 * still arriving; the sub-agent's first two variants are booting under it, files
 * the Pages rail already lists. A destructive command is waiting for an answer,
 * and the turn can be stopped.
 */
export default function AgentWideWorkingFrame() {
	return <SpoolAgentScreen variant="working" />;
}
