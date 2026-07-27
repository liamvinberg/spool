import { SpoolAgentTurnScreen } from "../../../shared/ui/spool-agent-turn-screen";

/**
 * Beat 4 of 6 — two things arriving on one wire.
 *
 * The best mechanic in the whole turn: a tool call exists before its arguments
 * do. `content_block_start` names it `read` with an empty input, and the path
 * then arrives as partial JSON that splits mid-token. So the row appears named
 * and pathless, the caret moves out of the sentence and into the argument slot,
 * and the path types itself in as three uneven fragments before the row flips
 * to running.
 *
 * The prose never finishes, because this beat is mid-stream. It holds where the
 * last token left it, caret still going.
 */
export default function AgentStreamingFrame() {
	return (
		<div className="h-full w-full" data-go="agent-tools">
			<SpoolAgentTurnScreen beat="streaming" />
		</div>
	);
}
