// The door is a strip under the list, always in the same place, saying what it
// is and what key does it. The folder lands where the prefix says.
import { NewProjectStrip } from "shared/ui/explore/new-project/new-project-strip";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectStripFrame() {
	return (
		<SpoolHomeScreen overlay={<NewProjectStrip seed={{ path: "/Users/liamvinberg/personal/projects" }} />} />
	);
}
