import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * Reach at two volumes. Hover echoes faintly in the other frames on screen,
 * selection rings them. The faint line is the cursor's, the ring is the hand's.
 *
 * Between `shared-reach` and `shared-select`: hover still tells you something,
 * at a weight meant to sit under the threshold that moves the eye. Whether
 * 22% of the thread red is under that threshold is what this frame is for.
 */
export default function SharedEchoFrame() {
	return <SharedScreen take="echo" />;
}
