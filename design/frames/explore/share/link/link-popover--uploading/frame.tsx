import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" stage="uploading" panel="manage" progress={0.4} copied caption="A · link copied at once, files land behind it" />;
}
