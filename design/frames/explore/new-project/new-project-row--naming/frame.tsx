// The prefix does not move while you name, because it is still the location,
// and the list collapses to the one line the folder is about to be.
import { NewProjectRow } from "shared/ui/explore/new-project/new-project-row";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectRowNamingFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectRow
					seed={{ path: "/Users/liamvinberg/personal/projects", naming: true, name: "tvarso" }}
				/>
			}
		/>
	);
}
