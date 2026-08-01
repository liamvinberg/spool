import { PlayedTab } from "../../../shared/ui/browser-tab";
import { TidemarkLanding } from "../../../shared/ui/tidemark-landing";

/**
 * play-tab--bare: spool draws nothing.
 *
 * The tab is the player. The frame gets the whole viewport, the browser scrolls
 * it, and there is no spool pixel anywhere inside the page area — the way a
 * local html file opens. Identity and exit both move up into chrome the browser
 * already draws and the operating system already taught everybody: the favicon
 * and the title say which frame this is, ⌘W closes it, ⌘⇧T brings it back, and
 * the canvas is still sitting one tab to the left where it always was.
 *
 * What is given up is visible by its absence: no back-to-canvas, no frame
 * switcher, no walk controls, no readout. Every one of those becomes a trip to
 * the other tab. This frame is the floor the other three have to beat.
 */

export default function PlayTabBareFrame() {
	return (
		<PlayedTab title="landing · tidemark" url="127.0.0.1:7766/play/tidemark?frame=landing">
			<TidemarkLanding />
		</PlayedTab>
	);
}
