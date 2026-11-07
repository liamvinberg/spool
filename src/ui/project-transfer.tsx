import { exportProject } from "./api";
import { type Exported, landed, useExportSteps } from "./canvas/export-menu";
import { downloadBlob } from "./canvas/frame-export";
import { desktopWindow } from "./desktop-window";

/**
 * Export project… (spool#240): the project as a .spool file, built and saved
 * in the menu that asked, in the steps a frame's export takes past its choice.
 * A project has no format to choose, so it goes straight to Building.
 */
export function useProjectExport(project: { name: string; root: string }, onClose: () => void) {
	const exporting = useExportSteps({ finder: desktopWindow()?.onProjectDownload !== undefined, onClose });
	return {
		...exporting,
		start: () => exporting.run(`${project.name}.spool`, 1, () => exportProjectFile(project.root)),
	};
}

/** Build the .spool, hand it to the browser to download, and in the Mac app wait for it to say where it landed. */
async function exportProjectFile(root: string): Promise<Exported> {
	const { blob, filename } = await exportProject(root);
	const bridge = desktopWindow();
	const listen = bridge?.onProjectDownload?.bind(bridge);
	// the app names no request in a project's report, so the next one it sends is this file's
	const saved = landed(
		[filename],
		listen && ((heard) => listen((report) => heard({ ...report, requested: filename }))),
	);
	downloadBlob(blob, filename);
	const [report] = (await saved) ?? [];
	return { file: report?.filename ?? filename, bytes: blob.size, path: report?.path };
}
