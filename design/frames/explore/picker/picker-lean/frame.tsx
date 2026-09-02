import { PickerLean } from "shared/ui/explore/picker/picker-min";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function PickerLeanFrame() {
	return <SpoolHomeScreen overlay={<PickerLean />} />;
}
