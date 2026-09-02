// Lands in ~/Spool/<name> by default and in a folder chosen through Finder
// otherwise, because this door never opens the picker and has no browsed place.
import { NewProjectHome } from "shared/ui/explore/new-project/new-project-home";

export default function NewProjectHomeFrame() {
	return <NewProjectHome />;
}
