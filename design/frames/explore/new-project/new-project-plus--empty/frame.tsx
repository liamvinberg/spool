// A folder with nothing in it: the field, the prefix, the "+", and one line
// saying so. The door is the only thing on screen worth pressing.
import { NewProjectPlus } from "shared/ui/explore/new-project/new-project-plus";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectPlusEmptyFrame() {
	return (
		<SpoolHomeScreen overlay={<NewProjectPlus seed={{ path: "/Users/liamvinberg/Applications" }} />} />
	);
}
