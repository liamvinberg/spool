import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="instant" stage="uploading" progress={0.2} copied caption="B · copied, no dialog" />;
}
