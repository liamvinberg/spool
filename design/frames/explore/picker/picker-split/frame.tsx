import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { SpoolPickerSplit } from "shared/ui/explore/picker/picker-split";

export default function SpoolPickerSplitFrame() {
	return <SpoolHomeScreen overlay={<SpoolPickerSplit />} />;
}
