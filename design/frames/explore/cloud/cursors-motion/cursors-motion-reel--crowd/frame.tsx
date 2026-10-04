import { CROWD } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { REEL } from "shared/ui/explore/cloud/cursors-motion/take-reel";

export default function CursorsMotionReelCrowd() {
	return <Stage scene={CROWD} take={REEL} state="crowd" start={3.2} />;
}
