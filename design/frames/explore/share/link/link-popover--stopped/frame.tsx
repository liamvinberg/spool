import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" toast="Stopped sharing cart" progress={0} caption="A · stopped" />;
}
