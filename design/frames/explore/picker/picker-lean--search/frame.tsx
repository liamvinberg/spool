import { PickerLean } from "shared/ui/explore/picker/picker-min";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function PickerLeanSearchFrame() {
	return <SpoolHomeScreen overlay={<PickerLean seed={{ path: "/Users/liamvinberg/personal/projects", query: "brute" }} />} />;
}
