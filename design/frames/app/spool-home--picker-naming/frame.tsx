import { ui } from "spool";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
export default function Frame() {
	return <SpoolHomeScreen initialPicker="start" initialName="workshop" onGo={() => ui.go("spool-empty-project")} />;
}
