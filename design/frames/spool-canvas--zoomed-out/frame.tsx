import { SpoolCanvasScreen } from "../../shared/ui/spool-canvas-screen";

export default function SpoolCanvasZoomedOutFrame() {
	return (
		<SpoolCanvasScreen
			variant="zoomed-out"
			homeTarget="spool-home"
			liveTarget="spool-canvas--live"
			designTarget="spool-canvas--design"
			playTarget="spool-player"
		/>
	);
}
