import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { threadTake } from "shared/ui/explore/cloud/cursors-identity/take-thread";

export default function IdentityThreadCrowd() {
	return <PresenceStage take={threadTake} scenario="crowd" start={5.6} />;
}
