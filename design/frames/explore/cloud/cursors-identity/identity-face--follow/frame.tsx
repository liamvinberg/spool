import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { faceTake } from "shared/ui/explore/cloud/cursors-identity/take-face";

export default function IdentityFaceFollow() {
	return <PresenceStage take={faceTake} scenario="follow" start={3.0} />;
}
