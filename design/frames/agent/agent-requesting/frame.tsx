import { SpoolAgentTurnScreen } from "../../../shared/ui/spool-agent-turn-screen";

/**
 * Beat 2 of 6 — sent, and nothing back.
 *
 * The hardest beat: `status: "requesting"` is genuinely all the stream has
 * emitted. A spinner alone here reads as a hang, so the waiting is built out of
 * three true things instead. The turn's thread does not stop at the message, it
 * runs on into the empty space with a light travelling down it. A clock is
 * moving, so the pipe is visibly open. And init's own facts sit under the
 * status, so you can see what went down the pipe rather than only that
 * something did.
 *
 * Stop appears here and stays for the rest of the turn.
 */
export default function AgentRequestingFrame() {
	return (
		<div className="h-full w-full" data-go="agent-thinking">
			<SpoolAgentTurnScreen beat="requesting" />
		</div>
	);
}
