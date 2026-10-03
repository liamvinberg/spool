import { rooms } from "shared/ui/explore/cloud/presence-wild/rooms";
import { crowd } from "shared/ui/explore/cloud/presence-wild/scenes";
import { PresenceWindow } from "shared/ui/explore/cloud/presence-wild/stage";

export default function Frame() {
	return <PresenceWindow scene={crowd} take={rooms} />;
}
