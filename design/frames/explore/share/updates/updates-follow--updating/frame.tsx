import { ShareLink } from "shared/ui/explore/share-link/share-link";

export default function Frame() {
	return <ShareLink take="popover" updates="follow" stage="updating" progress={0.66} caption="follow · pushed when the turn ended" />;
}
