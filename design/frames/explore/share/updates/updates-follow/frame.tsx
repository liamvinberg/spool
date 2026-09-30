import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" updates="follow" stage="agent" panel="manage" caption="follow · waits for the agent's turn to end" />;
}
