import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" stage="live" panel="manage" stopping caption="A · stop sharing, confirmed in place" />;
}
