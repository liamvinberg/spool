import { score } from "shared/ui/explore/cloud/presence-wild/score";
import { far } from "shared/ui/explore/cloud/presence-wild/scenes";
import { PresenceWindow } from "shared/ui/explore/cloud/presence-wild/stage";

export default function Frame() {
	return <PresenceWindow scene={far} take={score} />;
}
