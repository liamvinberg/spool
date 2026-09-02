import { PageObjectsScreen } from "shared/ui/spool-page-objects";

/**
 * The same twelve pages with the two things true aspect got wrong put right.
 *
 * A page's box is clamped to a band and the cover sits inside it whole, so
 * `booting` reads as a ribbon in a wide tile instead of a hairline. And the box
 * grows with the frame count, so `variants` at 45 outweighs `directing` at 1
 * rather than the other way round. Still a place a hand can move.
 */
export default function ExplorerRealTileFrame() {
	return (
		<PageObjectsScreen
			mode="tile"
			argues="A page's shape is banded and its size is what it holds. Placeable, and legible at every count."
		/>
	);
}
