import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { cornerTake } from "shared/ui/explore/cloud/cursors-identity/take-corner";

export default function IdentityCornerCrowd() {
	return <PresenceStage take={cornerTake} scenario="crowd" start={5.6} />;
}
