import { ui } from "spool";
import { ShareCanvas } from "shared/ui/explore/share/share-canvas";
import { ShareDialog } from "shared/ui/explore/share/share-dialog";

/**
 * The wait. spool compiles the project and uploads it, and says so in the
 * register a machine speaks in. Pressing the busy button carries the walk on.
 */
export default function ShareMintingFrame() {
	return (
		<ShareCanvas
			overlay={
				<ShareDialog
					state="minting"
					onCreate={() => {
						ui.go("share-scope--ready");
					}}
					onCancel={() => {
						ui.go("share-menu");
					}}
				/>
			}
		/>
	);
}
