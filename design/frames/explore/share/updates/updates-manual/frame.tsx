import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" updates="manual" stage="agent" caption="manual · the agent is editing a shared frame" />;
}
