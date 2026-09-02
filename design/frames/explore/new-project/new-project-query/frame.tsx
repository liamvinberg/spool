// Lands in the browsed folder, printed in the row itself, because the offer has
// to be readable without also reading the breadcrumb above it.
import { NewProjectQuery } from "shared/ui/explore/new-project/new-project-query";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectQueryFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectQuery start={{ path: "/Users/liamvinberg/personal/projects", query: "brute" }} />
			}
		/>
	);
}
