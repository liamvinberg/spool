import { CROWD } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { DOCK } from "shared/ui/explore/cloud/cursors-motion/take-dock";

export default function CursorsMotionDockCrowd() {
	return <Stage scene={CROWD} take={DOCK} state="crowd" start={3.2} />;
}
