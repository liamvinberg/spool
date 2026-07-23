import { SpoolExportPrototype } from "../../shared/ui/spool-export-prototype";

// One-click PNG for one frame, with a format dialog only for a multi-selection.
export default function SpoolCanvasExportAdaptiveFrame() {
	return <SpoolExportPrototype concept="adaptive" />;
}
