import { UnseenCanvas } from "../../../shared/ui/spool-unseen-canvas";

/**
 * The disc, in the frame's own label, clearing when you look.
 *
 * Six frames arrived while you were away. Pan across them and the marks go out
 * behind you, one after another, as each frame sits readable long enough to have
 * been read. Sweep past at speed, or stay zoomed out under 150px a frame, and
 * every mark is still standing when you stop.
 */
export default function UnseenDotFrame() {
	return <UnseenCanvas mark="dot" clear="view" />;
}
