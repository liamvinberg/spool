import { CROWD } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { HUSH } from "shared/ui/explore/cloud/cursors-motion/take-hush";

export default function CursorsMotionHushCrowd() {
	return <Stage scene={CROWD} take={HUSH} state="crowd" start={3.2} />;
}
