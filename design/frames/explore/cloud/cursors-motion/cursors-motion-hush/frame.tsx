import { LOOP } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { HUSH } from "shared/ui/explore/cloud/cursors-motion/take-hush";

export default function CursorsMotionHush() {
	return <Stage scene={LOOP} take={HUSH} state="loop" start={4.6} />;
}
