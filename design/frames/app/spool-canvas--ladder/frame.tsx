import { SelectScreen } from "shared/ui/spool/select-screen";

/** Figma's ladder taken whole: double-click descends, and Enter runs the frame. */
export default function SelectDescendFrame() {
	return <SelectScreen ladder="descend" />;
}
// perf-probe
