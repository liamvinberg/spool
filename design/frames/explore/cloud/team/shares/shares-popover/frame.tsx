import { ui } from "spool";
import { SharesPopover } from "shared/ui/explore/cloud/team/shares/shares-popover";

export default function Frame() {
	return <SharesPopover onManage={() => ui.go("explore/cloud/team/shares/shares-popover--manage")} />;
}
