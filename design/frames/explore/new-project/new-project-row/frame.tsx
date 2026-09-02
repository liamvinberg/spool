// Lands in the folder the field's prefix names: the list answers which folder,
// and a folder that does not exist yet is one more answer to that.
import { NewProjectRow } from "shared/ui/explore/new-project/new-project-row";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectRowFrame() {
	return (
		<SpoolHomeScreen
			overlay={<NewProjectRow seed={{ path: "/Users/liamvinberg/personal/projects" }} />}
		/>
	);
}
