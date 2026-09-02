// Pressed: the same name field and the same one line, because where the door
// was stops mattering the moment it is open.
import { NewProjectStrip } from "shared/ui/explore/new-project/new-project-strip";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectStripNamingFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectStrip
					seed={{ path: "/Users/liamvinberg/personal/projects", naming: true, name: "tvarso" }}
				/>
			}
		/>
	);
}
