import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { NewProjectPlus } from "shared/ui/spool/picker-plus";

/** The "+" picker as it ships (#251, #242): one field, a list, and the "+" that makes a folder. */
export default function SpoolPickerFrame() {
	return <SpoolHomeScreen overlay={<NewProjectPlus seed={{ path: "/Users/liamvinberg/personal/projects" }} />} />;
}
