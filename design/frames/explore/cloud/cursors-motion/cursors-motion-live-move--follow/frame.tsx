import { LOOP } from "shared/ui/explore/cloud/cursors-motion/engine";
import { Stage } from "shared/ui/explore/cloud/cursors-motion/stage";
import { live } from "shared/ui/explore/cloud/cursors-motion/take-live";

export default function Frame() {
	return <Stage scene={LOOP} take={live("move")} state="follow" start={5.2} />;
}
