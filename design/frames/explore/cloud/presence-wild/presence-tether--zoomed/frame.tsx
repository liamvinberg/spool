import { tether } from "shared/ui/explore/cloud/presence-wild/tether";
import { zoomed } from "shared/ui/explore/cloud/presence-wild/scenes";
import { PresenceWindow } from "shared/ui/explore/cloud/presence-wild/stage";

export default function Frame() {
	return <PresenceWindow scene={zoomed} take={tether} />;
}
