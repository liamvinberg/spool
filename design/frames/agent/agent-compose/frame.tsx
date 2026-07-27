import { SpoolAgentTurnScreen } from "../../../shared/ui/spool-agent-turn-screen";

/**
 * Beat 1 of 6 — typed, not sent.
 *
 * The composer is the whole argument of this beat. It is a field, not a slot:
 * three rows at rest, and the selection chip lives inside the same bounded box
 * as the prompt because chip and prompt go out as one message. The model pill
 * reads what init opened the session with.
 *
 * The only motion is the caret. Nothing is in flight, so nothing else should
 * move, and stop has nothing to stop yet.
 *
 * The walk forward is on the frame itself: a click anywhere sends the turn.
 */
export default function AgentComposeFrame() {
	return (
		<div className="h-full w-full" data-go="agent-requesting">
			<SpoolAgentTurnScreen beat="compose" />
		</div>
	);
}
