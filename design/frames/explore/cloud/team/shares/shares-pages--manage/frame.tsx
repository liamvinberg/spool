import { ui } from "spool";
import { SharesPages } from "shared/ui/explore/cloud/team/shares/shares-pages";

export default function Frame() {
	return <SharesPages state="manage" onBack={() => ui.go("explore/cloud/team/shares/shares-pages")} />;
}
