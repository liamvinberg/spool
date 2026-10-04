import { LOOP } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { HUSH } from "shared/ui/explore/cloud/cursors-motion/take-hush";

export default function CursorsMotionHushFollow() {
	return <Stage scene={LOOP} take={HUSH} state="follow" start={6.4} />;
}
