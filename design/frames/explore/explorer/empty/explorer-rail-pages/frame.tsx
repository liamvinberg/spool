import { ExplorerScreen } from "shared/ui/spool-explorer-screen";

/**
 * A page stands on the field as a stack of the frames it holds.
 *
 * Press one to go in. `application` is the case this take is really about: three
 * frames and two pages in one row at one size, because an object that only shows
 * up when the field is empty is a placeholder rather than an object.
 */
export default function ExplorerPagesFrame() {
	return (
		<ExplorerScreen
			take="pages"
			start="p-explorations"
			argues="A page is a thing on the canvas. Frame size, frame order, beside the frames."
		/>
	);
}
