import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * P3 the other way. The gradient is drawn as a bar under fill with its stops
 * on it: drag a stop along to move its position, click one to edit its colour
 * and alpha in the one row below. Figma's gradient editor, said with from/via/to.
 * Select `promo`. Compare with `properties--rail`, where the stops are three rows.
 */
export default function PropertiesRailGradientBarFrame() {
	return <PropertiesScreen shape={{ variants: "bar", gradient: "bar" }} />;
}
