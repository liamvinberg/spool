import { thread } from "shared/ui/explore/cloud/cursors-spool/look-thread";
import { FOLLOW } from "shared/ui/explore/cloud/cursors-spool/scene";
import { CursorWindow } from "shared/ui/explore/cloud/cursors-spool/stage";

export default function Frame() {
	return <CursorWindow scene={FOLLOW} look={thread} start={4} />;
}
