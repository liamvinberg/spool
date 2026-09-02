import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { SpoolPickerToday } from "shared/ui/explore/picker/picker-today";

export default function SpoolPickerTodayFrame() {
	return <SpoolHomeScreen overlay={<SpoolPickerToday />} />;
}
