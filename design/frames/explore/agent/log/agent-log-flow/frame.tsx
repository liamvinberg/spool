import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-log-flow: the log's height is the eased number.
 *
 * The same time constant as `glide`, applied to the other side of the box. The log's
 * content is measured and a wrapper eases toward that height, clipping what has not
 * been given room yet, so a new row is uncovered from its top down as the space for it
 * opens and the rows above glide up by exactly the space that has opened so far. Rows
 * only fade, because the uncover is already the arrival.
 *
 * Against `glide` the difference is direction. There the row comes up from under the
 * foot; here it is revealed in place. Both cover prose growing a line. Which reads as
 * the log growing and which reads as the camera moving is the thing to watch for.
 */
export default function AgentLogFlowFrame() {
	return <StreamStage words="fade" log="flow" />;
}
