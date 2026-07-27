import { SpoolAgentTurnScreen } from "../../../shared/ui/spool-agent-turn-screen";

/**
 * Beat 5 of 6 — the run in flight, and the canvas carrying half of it.
 *
 * The edit landed on the shared checkout bar, so cart repaints out on the field
 * while the rail still says +6 -2. The sub-agent's three takes are the frames
 * themselves inside one dashed enclosure, two painted and one an empty socket
 * because its file is still being written. Running state is colourless
 * throughout, so the one red thing left in the rail is the decision waiting on
 * a person.
 *
 * Allow and Deny are the same button. An rm -rf is not the moment to make one
 * of them prettier, and allow is the walk forward because allow is what
 * actually moves the turn.
 */
export default function AgentToolsFrame() {
	return (
		<div className="h-full w-full" data-go="agent-settled">
			<SpoolAgentTurnScreen beat="tools" />
		</div>
	);
}
