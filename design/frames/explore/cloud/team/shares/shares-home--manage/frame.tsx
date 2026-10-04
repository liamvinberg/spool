import { ui } from "spool";
import { SharesHome } from "shared/ui/explore/cloud/team/shares/shares-home";

export default function Frame() {
	return <SharesHome state="manage" onBack={() => ui.go("explore/cloud/team/shares/shares-home")} />;
}
