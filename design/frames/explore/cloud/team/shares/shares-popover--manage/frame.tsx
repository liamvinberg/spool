import { ui } from "spool";
import { SharesPopover } from "shared/ui/explore/cloud/team/shares/shares-popover";

export default function Frame() {
	return <SharesPopover state="manage" onBack={() => ui.go("explore/cloud/team/shares/shares-popover")} />;
}
