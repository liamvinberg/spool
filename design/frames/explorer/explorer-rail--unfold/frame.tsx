import { ExplorerScreen } from "shared/ui/spool-explorer-screen";

/**
 * The rail answers and the field is left alone.
 *
 * Standing on `explorations` the canvas is as blank as it ships; the tree under
 * the row is what tells you the page is full. Press any other page of pages —
 * `application`, `site` — and it unfolds as you arrive, while a page with frames
 * on it still folds by its chevron alone.
 */
export default function ExplorerUnfoldFrame() {
	return (
		<ExplorerScreen
			start="p-explorations"
			unfoldHollow
			argues="Going into a page with no frames unfolds it. The tree shows what the field cannot."
		/>
	);
}
