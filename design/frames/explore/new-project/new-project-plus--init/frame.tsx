// Enter landed on a folder spool does not recognise. The offer to scaffold it
// is one line in the list area, which is the only place it ever appears.
import { NewProjectPlus } from "shared/ui/explore/new-project/new-project-plus";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectPlusInitFrame() {
	return (
		<SpoolHomeScreen
			overlay={<NewProjectPlus seed={{ path: "/Users/liamvinberg/personal/experiments", init: true }} />}
		/>
	);
}
