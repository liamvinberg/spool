// Lands wherever the location field says, which is ~/Spool/<name> until you
// change it: the only take where the location is asked rather than inherited.
import { NewProjectFooter } from "shared/ui/explore/new-project/new-project-footer";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectFooterFrame() {
	return (
		<SpoolHomeScreen
			overlay={<NewProjectFooter start={{ path: "/Users/liamvinberg/personal/projects" }} />}
		/>
	);
}
