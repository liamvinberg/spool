import { ui } from "spool";
import { PageNow } from "shared/ui/explore/cloud/home/now";

export default function Frame() {
	return <PageNow onOpen={() => ui.go("app/spool-canvas")} />;
}
