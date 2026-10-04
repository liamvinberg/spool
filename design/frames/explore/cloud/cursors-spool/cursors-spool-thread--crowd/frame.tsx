import { thread } from "shared/ui/explore/cloud/cursors-spool/look-thread";
import { CROWD } from "shared/ui/explore/cloud/cursors-spool/scene";
import { CursorWindow } from "shared/ui/explore/cloud/cursors-spool/stage";

export default function Frame() {
	return <CursorWindow scene={CROWD} look={thread} start={4} />;
}
