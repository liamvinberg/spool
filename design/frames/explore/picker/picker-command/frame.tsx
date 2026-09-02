import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { SpoolPickerCommand } from "shared/ui/explore/picker/picker-command";

export default function SpoolPickerCommandFrame() {
	return <SpoolHomeScreen overlay={<SpoolPickerCommand />} />;
}
