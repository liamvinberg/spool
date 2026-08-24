import { SpoolHomeScreen } from "../../../shared/ui/spool-home-screen";
import { SpoolPickerSearch } from "../../../shared/ui/spool-picker-search";

export default function SpoolPickerSearchFrame() {
	return <SpoolHomeScreen overlay={<SpoolPickerSearch />} />;
}
