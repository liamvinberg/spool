import { PageObjectsScreen } from "../../../shared/ui/spool-page-objects";

/**
 * The same twelve pages, with the field owning where they sit.
 *
 * One cell per page, four to a row, in the rail's order. Nothing to drag and no
 * coordinate to store: rearranging is reordering the rail, which is state spool
 * already keeps. ⌘ + scroll zooms, dragging the field pans.
 */
export default function ExplorerRealFlowFrame() {
	return (
		<PageObjectsScreen
			mode="flow"
			argues="The field lays the pages out. Order is the rail's, and no page gains a coordinate."
		/>
	);
}
