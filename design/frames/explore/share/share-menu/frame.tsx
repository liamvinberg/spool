import { ui } from "spool";
import { ShareCanvas, ShareMenu } from "shared/ui/explore/share/share-canvas";

/**
 * The door. Right-click a frame and sharing is one row down from Export, in
 * the menu that already holds every decided action a frame has.
 */
export default function ShareMenuFrame() {
	return (
		<ShareCanvas
			menu={
				<ShareMenu
					at={{ x: 630, y: 250 }}
					onShare={() => {
						ui.go("share-scope");
					}}
				/>
			}
		/>
	);
}
