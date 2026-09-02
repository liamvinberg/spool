import { PickerList } from "shared/ui/explore/picker/picker-min";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function PickerListFrame() {
	return <SpoolHomeScreen overlay={<PickerList />} />;
}
