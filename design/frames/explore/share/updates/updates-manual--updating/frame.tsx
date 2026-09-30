import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" updates="manual" stage="updating" progress={0.66} caption="manual · only the changed files go up" />;
}
