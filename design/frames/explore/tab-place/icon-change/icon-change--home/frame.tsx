import { COVERS } from "shared/lib/explore/tab-place/tabs";
import { IconHome } from "shared/ui/explore/tab-place/icon-home";

/** Home's covers carry the same icon ahead of the name, and the cover's menu holds the same "Change icon…". */
export default function IconChangeHomeFrame() {
	return (
		<IconHome
			take="badge"
			covers={[
				{ tab: COVERS.kvitt, art: "notes", frames: 12, opened: "just now" },
				{ tab: COVERS.checkout, art: "studio", frames: 32, opened: "2 hours ago · 2 copies on this Mac" },
				{ tab: COVERS.kaffe, art: "coffee", frames: 18, opened: "yesterday" },
			]}
			menu="~/code/kvitt"
			frame="icon-change--home"
			argues="Home reads the same file. A cover shows the icon ahead of its name with the team badge in its corner, and the cover's menu offers “Change icon…” too."
		/>
	);
}
