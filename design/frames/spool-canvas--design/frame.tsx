import { SpoolCanvasScreen } from "../../shared/ui/spool-canvas-screen";

export default function SpoolCanvasDesignFrame() {
	return (
		<SpoolCanvasScreen
			variant="design"
			homeTarget="spool-home"
			liveTarget="spool-canvas--live"
			designTarget="spool-canvas--design"
			playTarget="spool-player"
		/>
	);
}
