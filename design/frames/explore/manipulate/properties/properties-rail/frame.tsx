import { PropertiesScreen } from "shared/ui/spool-properties-screen";

/**
 * The properties surface, decided (spool-cloud#16) and merged (spool-cloud#20):
 * the visual source of truth. A right rail over kaffe's cart, the grid take's
 * rows, the figma take's fields, the literal take's `+`, and the seven
 * primitives the inventory found missing: the scope bar at the top (P1), alpha
 * on every colour (P2), the gradient as rows under fill (P3), toggle sets (P4),
 * the compiler-gated `+` (P5), signs, fractions and units in every number box
 * (P6), radius folding to corners and border to edges (P7).
 *
 * Select `pay` for the scope bar, `promo` for the gradient, `header` for the
 * border edge, `items` for the logical padding, `sum` for font-variant-numeric.
 */
export default function PropertiesRailFrame() {
	return <PropertiesScreen />;
}
