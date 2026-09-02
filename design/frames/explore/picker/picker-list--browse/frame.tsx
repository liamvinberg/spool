import { PickerList } from "shared/ui/explore/picker/picker-min";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function PickerListBrowseFrame() {
	return <SpoolHomeScreen overlay={<PickerList seed={{ path: "/Users/liamvinberg/personal/projects" }} />} />;
}
