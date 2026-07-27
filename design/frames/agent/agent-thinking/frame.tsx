import { SpoolAgentTurnScreen } from "../../../shared/ui/spool-agent-turn-screen";

/**
 * Beat 3 of 6 — thinking, with nothing to read.
 *
 * `thinking_delta` carries an empty string and a token estimate. The words are
 * redacted, so a cell that streamed prose here would be a lie. What is real is
 * the count and the cadence it climbed at, so the cell is the number going up
 * and one tick per delta, each tick as tall as that delta was. The trace is the
 * exact shape of what the model sent, and it is what makes a redacted block
 * feel like work rather than a stall.
 *
 * One caption says why there are no words, once, quietly.
 */
export default function AgentThinkingFrame() {
	return (
		<div className="h-full w-full" data-go="agent-streaming">
			<SpoolAgentTurnScreen beat="thinking" />
		</div>
	);
}
