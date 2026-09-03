import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-log-open: a row opens to its own height and rises into it.
 *
 * The smallest diff: the same 6px rise, wrapped in a box that goes from no height to
 * the row's height over 260ms. The log above glides up because the thing pushing it is
 * growing rather than appearing. This is the gesture the design frames on this page have
 * carried since `agent-play`, and it is not what ships.
 *
 * It answers rows and nothing else. A message gaining a line still gains it at once, so
 * during the two prose blocks the log steps exactly as it does today.
 */
export default function AgentLogOpenFrame() {
	return <StreamStage words="fade" log="open" />;
}
