import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-log-cut: the rail today, kept as the row everything below is a diff against.
 *
 * A row mounts at its full height in the frame it lands and fades in with a 6px rise.
 * The log is anchored to its foot, so everything above the new row moves up by the
 * row's height in that same frame, and once the log overflows the box the scroll snaps
 * to the end for the same reason. The rise softens the row; nothing softens the log.
 *
 * The prose does it too, in its own way: each delta the reserve lands adds a line or
 * two of height at once, so the rows above a message being written step up in 20px and
 * 40px moves every half second.
 */
export default function AgentLogCutFrame() {
	return <StreamStage words="fade" log="cut" />;
}
