import { ui } from "spool";
import { LINK } from "shared/lib/explore/share/share-link";
import { ShareCanvas, ShareMenu } from "shared/ui/explore/share/share-canvas";

/**
 * After the link exists. The label says the frame is out there, and the menu
 * has split the one row in two: the link is a thing to copy now, and ending it
 * is its own verb rather than a setting inside the dialog that made it.
 */
export default function ShareSharedFrame() {
	return (
		<ShareCanvas
			shared
			menu={
				<ShareMenu
					at={{ x: 630, y: 250 }}
					shared
					onCopy={() => {
						void ui.copy(`https://${LINK}`);
					}}
				/>
			}
		/>
	);
}
