import { PickerField } from "shared/ui/explore/picker/picker-min";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function PickerFieldFrame() {
	return <SpoolHomeScreen overlay={<PickerField />} />;
}
