// Landed in ~/Spool, the default the field carried, and the picker walks there
// to show it: a folder spool made is a folder spool can browse.
import { NewProjectFooter } from "shared/ui/explore/new-project/new-project-footer";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function NewProjectFooterCreatedFrame() {
	return (
		<SpoolHomeScreen
			overlay={
				<NewProjectFooter
					start={{
						path: "/Users/liamvinberg/Spool",
						mode: "made",
						name: "tvarso",
						made: "/Users/liamvinberg/Spool",
					}}
				/>
			}
		/>
	);
}
