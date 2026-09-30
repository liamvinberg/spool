import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="instant" stage="uploading" progress={0.6} caption="B · the label is the progress" />;
}
