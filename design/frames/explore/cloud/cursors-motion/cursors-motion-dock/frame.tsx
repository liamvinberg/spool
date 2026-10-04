import { LOOP } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { DOCK } from "shared/ui/explore/cloud/cursors-motion/take-dock";

export default function CursorsMotionDock() {
	return <Stage scene={LOOP} take={DOCK} state="loop" start={4.6} />;
}
