import { ui } from "spool";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
export default function Frame() {
	return (
		<SpoolHomeScreen
			initialPicker="location"
			initialLocation="~/spool"
			onGo={(target) => (target === "spool-canvas" ? ui.go("spool-canvas") : ui.go("spool-empty-project"))}
		/>
	);
}
