import { SpoolCanvasScreen } from "../../shared/ui/spool-canvas-screen";

export default function SpoolCanvasLiveFrame() {
	return (
		<SpoolCanvasScreen
			variant="live"
			homeTarget="spool-home"
			liveTarget="spool-canvas--live"
			designTarget="spool-canvas--design"
			playTarget="spool-player"
		/>
	);
}
