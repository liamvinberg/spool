import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" updates="manual" stage="behind" panel="manage" caption="manual · the link is behind until you press Update" />;
}
