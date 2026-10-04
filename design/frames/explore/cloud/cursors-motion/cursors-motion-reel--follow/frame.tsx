import { LOOP } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { REEL } from "shared/ui/explore/cloud/cursors-motion/take-reel";

export default function CursorsMotionReelFollow() {
	return <Stage scene={LOOP} take={REEL} state="follow" start={6.4} />;
}
