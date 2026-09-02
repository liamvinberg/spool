import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { SpoolPickerInline } from "shared/ui/explore/picker/picker-inline";

export default function SpoolPickerInlineFrame() {
	return <SpoolHomeScreen overlay={<SpoolPickerInline />} />;
}
