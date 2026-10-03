import { PresenceStage } from "shared/ui/explore/cloud/presence-calm/stage";
import { tiersTake } from "shared/ui/explore/cloud/presence-calm/take-tiers";

export default function Frame() {
	return <PresenceStage take={tiersTake} state="follow" />;
}
