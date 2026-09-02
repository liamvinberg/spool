import { ExplorerScreen } from "../../../shared/ui/spool-explorer-screen";

/**
 * The field prints what is true about the page and stops.
 *
 * One mono line in the register the counts already use, plus the names of the
 * pages inside. `scratch` is the other empty and gets the sentence the empty
 * project gets: nothing is below it, so there is nothing to point at.
 */
export default function ExplorerSayFrame() {
	return (
		<ExplorerScreen
			take="say"
			start="p-explorations"
			argues="The field says where the frames went. It does not take you there."
		/>
	);
}
