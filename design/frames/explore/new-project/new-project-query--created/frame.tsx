// Landed in the browsed folder, and the query that named it now finds it: the
// folder you were looking for is the first hit for the words you looked with.
import { NewProjectQuery } from "shared/ui/explore/new-project/new-project-query";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectQueryCreatedFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectQuery
					start={{
						path: "/Users/liamvinberg/personal/projects",
						query: "tvarso",
						mode: "made",
						name: "tvarso",
						made: "/Users/liamvinberg/personal/projects",
					}}
				/>
			}
		/>
	);
}
