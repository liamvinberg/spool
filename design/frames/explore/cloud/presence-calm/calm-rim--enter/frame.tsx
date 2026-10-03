import { PresenceStage } from "shared/ui/explore/cloud/presence-calm/stage";
import { rimTake } from "shared/ui/explore/cloud/presence-calm/take-rim";

export default function Frame() {
	return <PresenceStage take={rimTake} state="enter" />;
}
