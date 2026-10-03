import { PresenceStage } from "shared/ui/explore/cloud/presence-calm/stage";
import { settleTake } from "shared/ui/explore/cloud/presence-calm/take-settle";

export default function Frame() {
	return <PresenceStage take={settleTake} state="zoomed" />;
}
