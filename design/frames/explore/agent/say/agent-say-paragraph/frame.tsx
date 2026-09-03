import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-paragraph: nothing streams. A paragraph appears when it is whole.
 *
 * The furthest row from today, and the one with the cleanest argument: text that is still
 * arriving cannot be read, so drawing it is motion the reader has to wait out anyway. A
 * paragraph is held until the one after it has begun or the message has ended, then it
 * opens into the log the way a row does, over 260ms, and the words rise into it. Until
 * then a caret alone says the agent is writing.
 *
 * What to watch for is the wait. The wire writes a paragraph in one to two seconds, so the
 * log is still for that long and then gains four lines at once, and the last paragraph
 * waits for the message to end. Whether that reads as calm or as a stall is the decision.
 */
export default function AgentSayParagraphFrame() {
	return <StreamStage words="paragraph" log="cut" focus="say" />;
}
