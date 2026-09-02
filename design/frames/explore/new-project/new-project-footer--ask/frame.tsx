// Lands wherever the location field says. Both candidates are on screen at
// once, so the default is a choice you can see rather than one you find out.
import { NewProjectFooter } from "shared/ui/explore/new-project/new-project-footer";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectFooterAskFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectFooter
					start={{ path: "/Users/liamvinberg/personal/projects", mode: "asking", name: "tvarso" }}
				/>
			}
		/>
	);
}
