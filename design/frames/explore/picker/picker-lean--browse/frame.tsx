import { PickerLean } from "shared/ui/explore/picker/picker-min";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function PickerLeanBrowseFrame() {
	return <SpoolHomeScreen overlay={<PickerLean seed={{ path: "/Users/liamvinberg/personal/projects" }} />} />;
}
