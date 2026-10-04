import { ribbon } from "shared/ui/explore/cloud/cursors-spool/look-ribbon";
import { MAIN } from "shared/ui/explore/cloud/cursors-spool/scene";
import { CursorWindow } from "shared/ui/explore/cloud/cursors-spool/stage";

export default function Frame() {
	return <CursorWindow scene={MAIN} look={ribbon} start={10.6} />;
}
