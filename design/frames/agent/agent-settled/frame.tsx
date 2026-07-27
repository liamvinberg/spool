import { SpoolAgentTurnScreen } from "../../../shared/ui/spool-agent-turn-screen";

/**
 * Beat 6 of 6 — settled, with the bill.
 *
 * The `result` event rendered as what it is: a receipt. Duration, turns, output
 * tokens, cache read, cost, landing left to right the way a receipt prints.
 *
 * Above it, standing state rather than turn state: the five-hour window at 90%,
 * in the same grey as everything else. The pitch is that this runs on your own
 * subscription, so the window is the honest cost of that pitch, and it belongs
 * on screen before it becomes a surprise. It is stated, not alarmed: red on
 * this rail is reserved for an error or a decision.
 *
 * cart--old is gone from the Pages rail, because the command was allowed. The
 * composer is back at rest with the selection still attached.
 */
export default function AgentSettledFrame() {
	return <SpoolAgentTurnScreen beat="settled" />;
}
