import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { cornerTake } from "shared/ui/explore/cloud/cursors-identity/take-corner";

export default function IdentityCorner() {
	return <PresenceStage take={cornerTake} scenario="base" start={5.6} />;
}
