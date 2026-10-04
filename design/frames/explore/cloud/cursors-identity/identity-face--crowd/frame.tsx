import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { faceTake } from "shared/ui/explore/cloud/cursors-identity/take-face";

export default function IdentityFaceCrowd() {
	return <PresenceStage take={faceTake} scenario="crowd" start={5.6} />;
}
