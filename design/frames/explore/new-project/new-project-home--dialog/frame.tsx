// Lands in ~/Spool/<name>, with Finder as the way out of that default: four
// rows, and none of them is the picker.
import { NewProjectHome } from "shared/ui/explore/new-project/new-project-home";

export default function NewProjectHomeDialogFrame() {
	return <NewProjectHome open start={{ name: "tvarso" }} />;
}
