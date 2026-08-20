import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * P1 the other way. No scope bar: the rail always edits the base, and every
 * variant chain the literal carries (`hover:`, `active:`, `disabled:`) is its
 * own section of rows at the foot, one row per token it sets, each drawn with
 * the primitive its family takes, with a `+` that lands under that prefix.
 * Everything is visible at once; nothing flips. Compare with `properties--rail`.
 */
export default function PropertiesRailVariantRowsFrame() {
	return <PropertiesScreen shape={{ variants: "rows", gradient: "rows" }} />;
}
