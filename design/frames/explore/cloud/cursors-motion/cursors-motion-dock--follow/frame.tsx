import { LOOP } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { DOCK } from "shared/ui/explore/cloud/cursors-motion/take-dock";

export default function CursorsMotionDockFollow() {
	return <Stage scene={LOOP} take={DOCK} state="follow" start={6.4} />;
}
