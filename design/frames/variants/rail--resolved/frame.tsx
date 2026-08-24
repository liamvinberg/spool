import { VariantsPropertiesScreen } from "../../../shared/ui/variants-properties";

/**
 * The same rail after the decision, which is the state a variation feature
 * spends most of its life in.
 *
 * The count is gone from the tab, because how many there were stops mattering
 * the moment one of them won. What is left is a record — decided, at 14:32,
 * card — and three discarded rows that can still be restored. The files are in
 * the Trash; the rail is what remembers they existed at all, and it keeps
 * remembering until the decision is closed for good.
 *
 * Restore any of them and the decision reopens, which is the only honest way
 * back: a set with two members again is a set with something to argue about.
 */
export default function RailResolvedFrame() {
	return (
		<VariantsPropertiesScreen
			start="resolved"
			name="rail--resolved"
			argues="What a decided set looks like: a record, three discarded rows, and a way back."
		/>
	);
}
