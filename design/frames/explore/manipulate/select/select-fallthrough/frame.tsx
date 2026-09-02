import { SelectScreen } from "shared/ui/spool-select-screen";

/** descend, plus the rung after the last one: at the leaf, double-click falls into the document. */
export default function SelectFallthroughFrame() {
	return <SelectScreen ladder="fallthrough" />;
}
