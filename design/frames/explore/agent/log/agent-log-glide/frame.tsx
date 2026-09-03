import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-log-glide: rows land instantly, and the picture eases into place.
 *
 * Layout is left alone. Every row takes its height in the frame it mounts, as today. The
 * change is one number: how far the picture still sits below where layout put it. Each
 * growth of the log adds its height to that number and every frame takes a fixed fraction
 * off, so the new row slides up from under the log's foot and the rows above glide with
 * it. Three rows landing in a second are one motion; one row is the same motion smaller.
 *
 * Because the number is read off the log's height and not off rows, it covers the thing
 * `open` cannot: a message gaining a line glides the same way a row does. It is the one
 * mechanism that treats everything that moves the log alike.
 */
export default function AgentLogGlideFrame() {
	return <StreamStage words="fade" log="glide" />;
}
