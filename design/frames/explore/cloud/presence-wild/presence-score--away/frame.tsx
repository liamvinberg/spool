import { score } from "shared/ui/explore/cloud/presence-wild/score";
import { away } from "shared/ui/explore/cloud/presence-wild/scenes";
import { PresenceWindow } from "shared/ui/explore/cloud/presence-wild/stage";

export default function Frame() {
	return <PresenceWindow scene={away} take={score} />;
}
