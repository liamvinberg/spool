import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * The properties surface, decided (spool-cloud#16) and the visual source of
 * truth: a right rail holding the writable few as token fields with pixels
 * beside them, the layout words as pickers, the source line, and a read-only
 * computed list under it. The six frames it was chosen from read back from
 * `71972ce`.
 */
export default function PropertiesRailFrame() {
	return <PropertiesScreen />;
}
