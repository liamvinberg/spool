import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { threadTake } from "shared/ui/explore/cloud/cursors-identity/take-thread";

export default function IdentityThread() {
	return <PresenceStage take={threadTake} scenario="base" start={5.6} />;
}
