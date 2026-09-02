import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * The smallest diff: the canvas says nothing at all.
 *
 * A shared element rings exactly like a local one, and the only thing that
 * changes is that the rail is live instead of greyed, with the file and the
 * count under the crumb. The count is `framesUsing`'s own, by file, so this
 * take costs nothing and is true of `kaffe-chrome.tsx` rather than of `Button`.
 *
 * The question it puts: is the rail enough? You learn an element is shared by
 * selecting it, never by passing over it.
 */
export default function SharedSourceFrame() {
	return <SharedScreen take="source" />;
}
