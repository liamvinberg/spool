import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" stage="interrupted" panel="manage" progress={0.4} caption="A · connection dropped mid-upload" />;
}
