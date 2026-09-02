// Lands in the folder the breadcrumb names: the list is the answer to "which
// folder", so a folder that does not exist yet is one more row of that answer.
import { NewProjectRow } from "shared/ui/explore/new-project/new-project-row";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectRowFrame() {
	return (
		<SpoolHomeScreen
			overlay={<NewProjectRow start={{ path: "/Users/liamvinberg/personal/experiments" }} />}
		/>
	);
}
