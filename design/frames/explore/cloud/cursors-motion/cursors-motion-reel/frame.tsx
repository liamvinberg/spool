import { LOOP } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { REEL } from "shared/ui/explore/cloud/cursors-motion/take-reel";

export default function CursorsMotionReel() {
	return <Stage scene={LOOP} take={REEL} state="loop" start={4.6} />;
}
