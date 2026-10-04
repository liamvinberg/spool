import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { threadTake } from "shared/ui/explore/cloud/cursors-identity/take-thread";

export default function IdentityThreadFollow() {
	return <PresenceStage take={threadTake} scenario="follow" start={3.0} />;
}
