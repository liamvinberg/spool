import { SpoolCanvasScreen } from "../../shared/ui/spool-canvas-screen";

export default function SpoolCanvasMenuToastFrame() {
	return (
		<SpoolCanvasScreen
			variant="menu-toast"
			homeTarget="spool-home"
			liveTarget="spool-canvas--live"
			designTarget="spool-canvas--design"
			playTarget="spool-player"
		/>
	);
}
