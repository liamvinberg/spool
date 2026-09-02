import { PageObjectsScreen } from "shared/ui/spool-page-objects";

/**
 * Spool's own design folder at its root, with every page an object a hand placed.
 *
 * Real names, real counts, and every cover is that page's own canvas drawn from
 * its frames' geometry and its stills. Drag a page to move it. ⌘ + scroll zooms,
 * dragging the field pans.
 *
 * The thing to look for: the shapes. Twelve pages, and `booting` is a 23:1
 * ribbon while `variants` is a block — a page's cover is its canvas, so no card
 * shape fits all of them.
 */
export default function ExplorerRealPlacedFrame() {
	return (
		<PageObjectsScreen
			mode="placed"
			argues="A page has a place a hand can move, so the root is arranged like any other canvas."
		/>
	);
}
