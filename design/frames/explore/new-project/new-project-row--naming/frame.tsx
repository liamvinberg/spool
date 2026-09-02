// Lands in the folder the breadcrumb names, and the header says so while you
// type: the field that searched becomes the field that names.
import { NewProjectRow } from "shared/ui/explore/new-project/new-project-row";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectRowNamingFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectRow
					start={{ path: "/Users/liamvinberg/personal/experiments", mode: "naming", name: "tvarso" }}
				/>
			}
		/>
	);
}
