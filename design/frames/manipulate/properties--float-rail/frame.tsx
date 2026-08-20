import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * Both: the card on the element holds what the hands can write, the rail holds what
 * they can only read — the source line and the computed list. Edit at the element,
 * inspect in the margin. Whether two places for one selection is a split or a
 * relief is what this frame is for.
 */
export default function PropertiesFloatRailFrame() {
	return <PropertiesScreen config={{ surface: "both", vocab: "tailwind", tail: true, agent: "off" }} />;
}
