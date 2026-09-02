// The folder is made, design/ is scaffolded, the tab is open on it: the query
// that found nothing became the name.
import { SpoolEmptyScreen } from "shared/ui/spool/empty-screen";

export default function NewProjectQueryCreatedFrame() {
	return <SpoolEmptyScreen project="tvarso" homeTarget="new-project-query" />;
}
