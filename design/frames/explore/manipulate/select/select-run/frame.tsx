import { SelectScreen } from "shared/ui/explore/manipulate/select-screen";

/** Running keeps its double-click; ⌘ stops being an elevator and becomes stairs. */
export default function SelectRunFrame() {
	return <SelectScreen ladder="run" />;
}
