import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" updates="follow" stage="live" fresh caption="follow · updated, then settles to shared" />;
}
