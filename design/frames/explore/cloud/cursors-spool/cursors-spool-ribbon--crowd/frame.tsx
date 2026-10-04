import { ribbon } from "shared/ui/explore/cloud/cursors-spool/look-ribbon";
import { CROWD } from "shared/ui/explore/cloud/cursors-spool/scene";
import { CursorWindow } from "shared/ui/explore/cloud/cursors-spool/stage";

export default function Frame() {
	return <CursorWindow scene={CROWD} look={ribbon} start={4} />;
}
