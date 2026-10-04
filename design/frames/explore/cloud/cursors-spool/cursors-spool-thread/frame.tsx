import { thread } from "shared/ui/explore/cloud/cursors-spool/look-thread";
import { MAIN } from "shared/ui/explore/cloud/cursors-spool/scene";
import { CursorWindow } from "shared/ui/explore/cloud/cursors-spool/stage";

export default function Frame() {
	return <CursorWindow scene={MAIN} look={thread} start={10.6} />;
}
