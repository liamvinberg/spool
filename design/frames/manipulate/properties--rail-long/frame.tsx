import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * The same rail with the long tail reachable: under the writable few, a `computed`
 * list of everything the element resolves to, named the way a stylesheet names it,
 * each row saying which token or which file produced it. Read-only, and it says so
 * by having no field. The question this frame exists to settle by feel: does the
 * tail earn its lines, or is it Claude Design's kitchen sink again.
 */
export default function PropertiesRailLongFrame() {
	return <PropertiesScreen config={{ surface: "rail", vocab: "tailwind", tail: true, agent: "off" }} />;
}
