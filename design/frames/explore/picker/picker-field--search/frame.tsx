import { PickerField } from "shared/ui/explore/picker/picker-min";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function PickerFieldSearchFrame() {
	return <SpoolHomeScreen overlay={<PickerField seed={{ path: "/Users/liamvinberg/personal/projects", query: "brute" }} />} />;
}
