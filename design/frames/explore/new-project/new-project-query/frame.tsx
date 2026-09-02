// Lands in the folder you were standing in before you typed, which the row
// prints itself because the prefix is gone while searching.
import { NewProjectQuery } from "shared/ui/explore/new-project/new-project-query";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectQueryFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectQuery seed={{ path: "/Users/liamvinberg/personal/projects", query: "brute" }} />
			}
		/>
	);
}
