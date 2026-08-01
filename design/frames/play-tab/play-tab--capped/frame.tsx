import { PlayedTab } from "../../../shared/ui/browser-tab";
import { TidemarkLanding } from "../../../shared/ui/tidemark-landing";

/**
 * play-tab--capped: the bare tab on a 1920 window, with the page held to 1400.
 *
 * Same zero chrome as play-tab--bare, same page, one variable changed: spool
 * caps the document instead of letting it have the window. It exists to be put
 * beside play-tab--bare and looked at, because the cap is the one decision in
 * this set that cannot be undone by a keystroke — a frame that is capped is
 * capped, and a designer who wanted to see their own breakpoint at 1920 never
 * gets to.
 *
 * The cap is 1400 rather than the window width, so the page runs with 260px of
 * dead margin on each side. Read it as the question it is: is a tidy measure
 * worth spool overriding a decision that belongs to the page?
 */

export default function PlayTabCappedFrame() {
	return (
		<PlayedTab title="landing · tidemark" url="127.0.0.1:7766/play/tidemark?frame=landing">
			<TidemarkLanding cap={1400} />
		</PlayedTab>
	);
}
