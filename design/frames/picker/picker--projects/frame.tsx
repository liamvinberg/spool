import { SpoolHomeScreen } from "../../../shared/ui/spool-home-screen";
import { SpoolPickerProjects } from "../../../shared/ui/spool-picker-projects";

export default function SpoolPickerProjectsFrame() {
	return <SpoolHomeScreen overlay={<SpoolPickerProjects />} />;
}
