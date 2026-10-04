import { stitch } from "shared/ui/explore/cloud/cursors-spool/look-stitch";
import { CROWD } from "shared/ui/explore/cloud/cursors-spool/scene";
import { CursorWindow } from "shared/ui/explore/cloud/cursors-spool/stage";

export default function Frame() {
	return <CursorWindow scene={CROWD} look={stitch} start={4} />;
}
