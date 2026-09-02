import { SelectScreen } from "shared/ui/explore/manipulate/select-screen";

/** One gesture for the whole depth: keep double-clicking and you land in the live document. */
export default function SelectDepthFrame() {
	return <SelectScreen ladder="depth" />;
}
