// Pressed: the field is a name field, the prefix has not moved because it is
// still the location, and the list is the one line the folder is about to be.
import { NewProjectPlus } from "shared/ui/explore/new-project/new-project-plus";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectPlusNamingFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectPlus
					seed={{ path: "/Users/liamvinberg/personal/projects", naming: true, name: "tvarso" }}
				/>
			}
		/>
	);
}
