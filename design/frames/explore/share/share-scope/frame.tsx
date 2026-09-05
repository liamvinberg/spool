import { ui } from "spool";
import { ShareCanvas } from "shared/ui/explore/share/share-canvas";
import { ShareDialog } from "shared/ui/explore/share/share-dialog";

/** Two decisions and nothing else: how much of the project the link reaches, and whether it keeps up. */
export default function ShareScopeFrame() {
	return (
		<ShareCanvas
			overlay={
				<ShareDialog
					state="scope"
					onCreate={() => {
						ui.go("share-scope--minting");
					}}
					onCancel={() => {
						ui.go("share-menu");
					}}
				/>
			}
		/>
	);
}
