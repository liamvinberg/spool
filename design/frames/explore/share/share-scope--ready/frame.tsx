import { ui } from "spool";
import { ShareCanvas } from "shared/ui/explore/share/share-canvas";
import { ShareDialog } from "shared/ui/explore/share/share-dialog";

/** What you are left holding: a URL, what it carries, and what it will keep doing. */
export default function ShareReadyFrame() {
	return (
		<ShareCanvas
			shared
			overlay={
				<ShareDialog
					state="ready"
					onOpen={() => {
						ui.go("share-guest");
					}}
					onCopy={(text) => {
						void ui.copy(text);
					}}
				/>
			}
		/>
	);
}
