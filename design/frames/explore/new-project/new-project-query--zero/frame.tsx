// Lands in the browsed folder. Nothing under ~ answers to the query, so the
// offer is the whole list rather than an apology followed by one.
import { NewProjectQuery } from "shared/ui/explore/new-project/new-project-query";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectQueryZeroFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectQuery start={{ path: "/Users/liamvinberg/personal/projects", query: "tvarso" }} />
			}
		/>
	);
}
