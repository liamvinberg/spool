// Landed in the folder the breadcrumb names, and the proof is the list: the
// folder is now a row like any other, wearing the chip a project wears.
import { NewProjectRow } from "shared/ui/explore/new-project/new-project-row";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectRowCreatedFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectRow
					start={{
						path: "/Users/liamvinberg/personal/experiments",
						mode: "made",
						name: "tvarso",
						made: "/Users/liamvinberg/personal/experiments",
					}}
				/>
			}
		/>
	);
}
