import { CROWD } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { live } from "shared/ui/explore/cloud/cursors-motion/take-live";

export default function Frame() {
	return <Stage scene={CROWD} take={live("grip")} state="crowd" start={2.4} />;
}
