import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { NewProjectPlus } from "shared/ui/spool/picker-plus";

/** The picker after "+" or ⌘N: the field is the name, the prefix is the location, the list is the one folder to be. */
export default function SpoolPickerNamingFrame() {
	return (
		<SpoolHomeScreen
			overlay={<NewProjectPlus seed={{ path: "/Users/liamvinberg/personal/projects", naming: true, name: "tvarso" }} />}
		/>
	);
}
