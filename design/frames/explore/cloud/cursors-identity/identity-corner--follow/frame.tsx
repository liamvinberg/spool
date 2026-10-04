import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { cornerTake } from "shared/ui/explore/cloud/cursors-identity/take-corner";

export default function IdentityCornerFollow() {
	return <PresenceStage take={cornerTake} scenario="follow" start={3.0} />;
}
