import { PresenceStage } from "shared/ui/explore/cloud/cursors-identity/stage";
import { faceTake } from "shared/ui/explore/cloud/cursors-identity/take-face";

export default function IdentityFace() {
	return <PresenceStage take={faceTake} scenario="base" start={5.6} />;
}
