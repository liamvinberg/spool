import { VariantsPropertiesScreen } from "shared/ui/explore/variants/variants-properties";

/**
 * The decision, in the rail spool is going to have.
 *
 * A copy of `properties--rail` with a second tab on it. The tab is there
 * because the selection is a frame holding a set, and it is the only place the
 * set exists: the field shows one card, so this take trades comparison for a
 * decision that is always to hand and always says how many are still in it.
 *
 * Press the payment block in the card to select an element instead, and the
 * strip goes: an element has no variations, so there is no tab to grey out.
 * Press keep on a row and the decision closes on the spot — the other three go
 * to the discarded group, recoverable, and the tab turns into a record.
 */
export default function RailDecideFrame() {
	return (
		<VariantsPropertiesScreen
			start="open"
			name="rail--decide"
			argues="The set is a decision in the properties rail, and the rail is the only place it exists."
		/>
	);
}
