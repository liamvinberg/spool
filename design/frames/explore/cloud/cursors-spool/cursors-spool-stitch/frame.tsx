import { stitch } from "shared/ui/explore/cloud/cursors-spool/look-stitch";
import { MAIN } from "shared/ui/explore/cloud/cursors-spool/scene";
import { CursorWindow } from "shared/ui/explore/cloud/cursors-spool/stage";

export default function Frame() {
	return <CursorWindow scene={MAIN} look={stitch} start={10.6} />;
}
