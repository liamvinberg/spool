import { SpoolHomeScreen } from "../../../shared/ui/spool-home-screen";
import { SpoolPickerCommand } from "../../../shared/ui/spool-picker-command";

export default function SpoolPickerCommandFrame() {
	return <SpoolHomeScreen overlay={<SpoolPickerCommand />} />;
}
