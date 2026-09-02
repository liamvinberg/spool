// The door is a "+" at the end of the field, where Finder has kept New Folder
// for twenty years. It makes the folder where the prefix says you are.
import { NewProjectPlus } from "shared/ui/explore/new-project/new-project-plus";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectPlusFrame() {
	return (
		<SpoolHomeScreen overlay={<NewProjectPlus seed={{ path: "/Users/liamvinberg/personal/projects" }} />} />
	);
}
