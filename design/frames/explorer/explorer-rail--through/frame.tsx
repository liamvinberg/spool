import { ExplorerScreen } from "../../../shared/ui/spool-explorer-screen";

/**
 * The page is a lens on everything under it.
 *
 * Standing on `explorations` you see all eight frames, dimmed and small, each
 * block under the name of the page it actually lives on. Press a name to narrow
 * to that page. The cost is on the field: it now draws frames that are not on
 * this page, so a drag onto it has no page to land in.
 */
export default function ExplorerThroughFrame() {
	return (
		<ExplorerScreen
			take="through"
			start="p-explorations"
			argues="You never lose sight of the work. The field shows frames it does not own."
		/>
	);
}
